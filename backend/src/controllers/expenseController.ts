import { Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../types/auth';
import logger from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { aiService } from '../services/aiService';

const prisma = new PrismaClient();

const createExpenseSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required').max(500),
  transactionDate: z.string().refine((date) => !isNaN(Date.parse(date))),
  merchant: z.string().max(100).optional(),
  paymentMethod: z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'BANK_TRANSFER', 'DIGITAL_WALLET']),
  categoryId: z.string().uuid().optional(),
  isRecurring: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  notes: z.string().max(1000).optional(),
  receiptUrl: z.string().url().optional(),
});

const bulkImportSchema = z.object({
  expenses: z.array(createExpenseSchema.omit({ receiptUrl: true })),
});

// Helper function to get default category
async function getDefaultCategory() {
  const defaultCategory = await prisma.category.findFirst({
    where: { name: 'Other' },
  });
  
  if (!defaultCategory) {
    // If no 'Other' category exists, create one
    return await prisma.category.create({
      data: {
        name: 'Other',
        description: 'Miscellaneous expenses',
        color: '#6B7280',
        icon: 'folder',
        isDefault: true,
      },
    });
  }
  
  return defaultCategory;
}

// Helper function to perform AI categorization with fallback
async function performAICategorization(expenseData: {
  description: string;
  merchant?: string;
  amount: number;
  paymentMethod: string;
}): Promise<{ categoryId: string; aiConfidence?: number; reasoning?: string }> {
  try {
    logger.info('Attempting AI categorization for expense:', {
      description: expenseData.description,
      merchant: expenseData.merchant,
      amount: expenseData.amount,
    });

    // Test AI service connection first
    const isConnected = await aiService.testConnection();
    if (!isConnected) {
      logger.warn('AI service connection test failed, using fallback categorization');
      throw new Error('AI service unavailable');
    }

    // Attempt AI categorization
    const aiResult = await aiService.categorizeExpense(expenseData);
    
    logger.info('AI categorization successful:', {
      categoryId: aiResult.categoryId,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
    });

    return {
      categoryId: aiResult.categoryId,
      aiConfidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
    };

  } catch (error) {
    logger.error('AI categorization failed:', error);
    
    // Fallback to default category
    const defaultCategory = await getDefaultCategory();
    
    return {
      categoryId: defaultCategory.id,
      aiConfidence: 0.1, // Low confidence for fallback
      reasoning: `AI categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}. Used default category.`,
    };
  }
}

export const getExpenses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    page = 1,
    limit = 20,
    category,
    startDate,
    endDate,
    search,
    paymentMethod,
    sortBy = 'transactionDate',
    sortOrder = 'desc',
    minAmount,
    maxAmount,
    isRecurring,
    tags,
  } = req.query;

  const skip = (Number(page) - 1) * Number(limit);
  const where: any = { userId: req.user!.id };

  // Apply filters
  if (category) where.categoryId = category;
  if (startDate || endDate) {
    where.transactionDate = {};
    if (startDate) where.transactionDate.gte = new Date(startDate as string);
    if (endDate) where.transactionDate.lte = new Date(endDate as string);
  }
  if (search) {
    where.OR = [
      { description: { contains: search as string, mode: 'insensitive' } },
      { merchant: { contains: search as string, mode: 'insensitive' } },
      { notes: { contains: search as string, mode: 'insensitive' } },
    ];
  }
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (minAmount || maxAmount) {
    where.amount = {};
    if (minAmount) where.amount.gte = Number(minAmount);
    if (maxAmount) where.amount.lte = Number(maxAmount);
  }
  if (isRecurring !== undefined) where.isRecurring = isRecurring === 'true';
  if (tags) {
    const tagArray = (tags as string).split(',');
    where.tags = { hasSome: tagArray };
  }

  // Build orderBy
  const orderBy: any = {};
  if (sortBy === 'amount') orderBy.amount = sortOrder;
  else if (sortBy === 'merchant') orderBy.merchant = sortOrder;
  else orderBy.transactionDate = sortOrder;

  const [expenses, totalCount] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy,
      include: {
        category: {
          select: { id: true, name: true, color: true, icon: true },
        },
      },
    }),
    prisma.expense.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / Number(limit));

  // Calculate summary statistics
  const summary = await prisma.expense.aggregate({
    where,
    _sum: { amount: true },
    _avg: { amount: true },
  });

  res.json({
    success: true,
    data: {
      expenses: expenses.map(expense => ({
        ...expense,
        amount: Number(expense.amount),
      })),
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalCount,
        hasNextPage: Number(page) < totalPages,
        hasPrevPage: Number(page) > 1,
        limit: Number(limit),
      },
      summary: {
        totalAmount: Number(summary._sum.amount) || 0,
        averageAmount: Number(summary._avg.amount) || 0,
        count: totalCount,
      },
    },
  });
});

export const createExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const validatedData = createExpenseSchema.parse(req.body);
  
  let categoryId = validatedData.categoryId;
  let aiConfidence: number | undefined;
  let aiReasoning: string | undefined;

  // If no category provided, use AI categorization
  if (!categoryId) {
    const aiResult = await performAICategorization({
      description: validatedData.description,
      merchant: validatedData.merchant,
      amount: validatedData.amount,
      paymentMethod: validatedData.paymentMethod,
    });

    categoryId = aiResult.categoryId;
    aiConfidence = aiResult.aiConfidence;
    aiReasoning = aiResult.reasoning;

    logger.info(`Expense categorized: ${categoryId} (confidence: ${aiConfidence})`);
  }

  const expense = await prisma.expense.create({
    data: {
      ...validatedData,
      userId: req.user!.id,
      categoryId: categoryId!,
      transactionDate: new Date(validatedData.transactionDate),
      aiConfidence,
    },
    include: {
      category: {
        select: { id: true, name: true, color: true, icon: true },
      },
    },
  });

  res.status(201).json({
    success: true,
    message: 'Expense created successfully',
    data: { 
      expense: {
        ...expense,
        amount: Number(expense.amount),
      },
      // Include AI categorization details if it was used
      ...(aiReasoning && {
        aiCategorization: {
          confidence: aiConfidence,
          reasoning: aiReasoning,
          categoryName: expense.category.name,
        }
      }),
    },
  });
});

export const updateExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const validatedData = createExpenseSchema.partial().parse(req.body);

  const expense = await prisma.expense.findFirst({
    where: { id, userId: req.user!.id },
  });

  if (!expense) {
    return res.status(404).json({
      success: false,
      message: 'Expense not found',
    });
  }

  const updateData: any = { ...validatedData };
  if (validatedData.transactionDate) {
    updateData.transactionDate = new Date(validatedData.transactionDate);
  }

  // If category was changed manually, clear AI confidence and learn from correction
  if (validatedData.categoryId && validatedData.categoryId !== expense.categoryId) {
    updateData.aiConfidence = null;
    
    // Learn from the correction if it was previously AI-categorized
    if (expense.aiConfidence && expense.aiConfidence > 0.1) {
      try {
        await aiService.learnFromCorrection(
          expense.categoryId,
          validatedData.categoryId,
          {
            description: expense.description,
            merchant: expense.merchant || undefined,
            amount: Number(expense.amount),
            paymentMethod: expense.paymentMethod,
          }
        );
        logger.info(`Learned from category correction: ${expense.categoryId} -> ${validatedData.categoryId}`);
      } catch (error) {
        logger.error('Failed to learn from correction:', error);
      }
    }
  }

  const updatedExpense = await prisma.expense.update({
    where: { id },
    data: updateData,
    include: {
      category: {
        select: { id: true, name: true, color: true, icon: true },
      },
    },
  });

  res.json({
    success: true,
    message: 'Expense updated successfully',
    data: { 
      expense: {
        ...updatedExpense,
        amount: Number(updatedExpense.amount),
      }
    },
  });
});

export const deleteExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const expense = await prisma.expense.findFirst({
    where: { id, userId: req.user!.id },
  });

  if (!expense) {
    return res.status(404).json({
      success: false,
      message: 'Expense not found',
    });
  }

  await prisma.expense.delete({ where: { id } });

  res.json({
    success: true,
    message: 'Expense deleted successfully',
  });
});

export const categorizeExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const expense = await prisma.expense.findFirst({
    where: { id, userId: req.user!.id },
  });

  if (!expense) {
    return res.status(404).json({
      success: false,
      message: 'Expense not found',
    });
  }

  try {
    const aiResult = await performAICategorization({
      description: expense.description,
      merchant: expense.merchant || undefined,
      amount: Number(expense.amount),
      paymentMethod: expense.paymentMethod,
    });

    const updatedExpense = await prisma.expense.update({
      where: { id },
      data: {
        categoryId: aiResult.categoryId,
        aiConfidence: aiResult.aiConfidence,
      },
      include: {
        category: {
          select: { id: true, name: true, color: true, icon: true },
        },
      },
    });

    res.json({
      success: true,
      message: 'Expense categorized successfully',
      data: {
        expense: {
          ...updatedExpense,
          amount: Number(updatedExpense.amount),
        },
        aiResult: {
          categoryName: updatedExpense.category.name,
          confidence: aiResult.aiConfidence || 0,
          reasoning: aiResult.reasoning || 'Categorization completed',
        },
      },
    });
  } catch (error) {
    logger.error('Categorization failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to categorize expense',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export const bulkImport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { expenses } = bulkImportSchema.parse(req.body);
  
  const results = {
    success: 0,
    failed: 0,
    errors: [] as Array<{ index: number; error: string; expenseData?: any }>,
    aiCategorizations: 0,
  };

  // Test AI service connection once before bulk import
  const aiServiceAvailable = await aiService.testConnection();
  
  if (!aiServiceAvailable) {
    logger.warn('AI service unavailable for bulk import, will use fallback categorization');
  }

  for (let i = 0; i < expenses.length; i++) {
    try {
      const expenseData = expenses[i];
      let categoryId = expenseData.categoryId;
      let aiConfidence: number | undefined;

      // Auto-categorize if no category provided
      if (!categoryId) {
        const aiResult = await performAICategorization({
          description: expenseData.description,
          merchant: expenseData.merchant,
          amount: expenseData.amount,
          paymentMethod: expenseData.paymentMethod,
        });
        
        categoryId = aiResult.categoryId;
        aiConfidence = aiResult.aiConfidence;
        
        if (aiConfidence && aiConfidence > 0.1) {
          results.aiCategorizations++;
        }
      }

      await prisma.expense.create({
        data: {
          ...expenseData,
          userId: req.user!.id,
          categoryId: categoryId!,
          transactionDate: new Date(expenseData.transactionDate),
          aiConfidence,
        },
      });

      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        index: i,
        error: error instanceof Error ? error.message : 'Unknown error',
        expenseData: expenses[i].description, // Include description for debugging
      });
      
      logger.error(`Bulk import error at index ${i}:`, error);
    }
  }

  res.json({
    success: true,
    message: `Bulk import completed: ${results.success} successful, ${results.failed} failed`,
    data: {
      ...results,
      aiServiceStatus: aiServiceAvailable ? 'available' : 'unavailable',
    },
  });
});

export const getExpenseById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const expense = await prisma.expense.findFirst({
    where: { id, userId: req.user!.id },
    include: {
      category: {
        select: { id: true, name: true, color: true, icon: true },
      },
    },
  });

  if (!expense) {
    return res.status(404).json({
      success: false,
      message: 'Expense not found',
    });
  }

  res.json({
    success: true,
    data: { 
      expense: {
        ...expense,
        amount: Number(expense.amount),
      }
    },
  });
});

export const getExpenseStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { period = 'month' } = req.query;

  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const [totalStats, categoryStats, paymentMethodStats, aiStats] = await Promise.all([
    prisma.expense.aggregate({
      where: {
        userId,
        transactionDate: { gte: startDate, lte: now },
      },
      _sum: { amount: true },
      _count: true,
      _avg: { amount: true },
    }),

    prisma.expense.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        transactionDate: { gte: startDate, lte: now },
      },
      _sum: { amount: true },
      _count: true,
    }),

    prisma.expense.groupBy({
      by: ['paymentMethod'],
      where: {
        userId,
        transactionDate: { gte: startDate, lte: now },
      },
      _sum: { amount: true },
      _count: true,
    }),

    // Add AI categorization stats
    prisma.expense.aggregate({
      where: {
        userId,
        transactionDate: { gte: startDate, lte: now },
        aiConfidence: { not: null },
      },
      _count: true,
      _avg: { aiConfidence: true },
    }),
  ]);

  // Get category details
  const categoryIds = categoryStats.map(stat => stat.categoryId);
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true, color: true, icon: true },
  });

  const enrichedCategoryStats = categoryStats.map(stat => {
    const category = categories.find(c => c.id === stat.categoryId);
    return {
      category: category || { id: stat.categoryId, name: 'Unknown', color: '#gray', icon: 'folder' },
      total: Number(stat._sum.amount) || 0,
      count: stat._count,
    };
  }).sort((a, b) => b.total - a.total);

  const enrichedPaymentStats = paymentMethodStats.map(stat => ({
    method: stat.paymentMethod.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
    total: Number(stat._sum.amount) || 0,
    count: stat._count,
  })).sort((a, b) => b.total - a.total);

  res.json({
    success: true,
    data: {
      period,
      dateRange: { startDate, endDate: now },
      summary: {
        total: Number(totalStats._sum.amount) || 0,
        count: totalStats._count,
        average: Number(totalStats._avg.amount) || 0,
      },
      categories: enrichedCategoryStats,
      paymentMethods: enrichedPaymentStats,
      aiCategorization: {
        totalAiCategorized: aiStats._count,
        averageConfidence: Number(aiStats._avg.aiConfidence) || 0,
        percentage: totalStats._count > 0 ? (aiStats._count / totalStats._count) * 100 : 0,
      },
    },
  });
});

export const getRecurringExpenses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const recurringExpenses = await prisma.expense.findMany({
    where: {
      userId,
      isRecurring: true,
    },
    include: {
      category: {
        select: { id: true, name: true, color: true, icon: true },
      },
    },
    orderBy: { transactionDate: 'desc' },
  });

  res.json({
    success: true,
    data: {
      expenses: recurringExpenses.map(expense => ({
        ...expense,
        amount: Number(expense.amount),
      })),
    },
  });
});

export const getCategories = asyncHandler(async (req: AuthRequest, res: Response) => {
  const categories = await prisma.category.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  res.json({
    success: true,
    data: { categories },
  });
});

export const getExpenseTags = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const expenses = await prisma.expense.findMany({
    where: { userId },
    select: { tags: true },
  });

  // Extract unique tags
  const allTags = expenses.flatMap(expense => expense.tags);
  const uniqueTags = [...new Set(allTags)].sort();

  res.json({
    success: true,
    data: { tags: uniqueTags },
  });
});

// New endpoint to get AI service status and stats
export const getAiServiceStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const [connectionStatus, availableModels, stats] = await Promise.all([
      aiService.testConnection(),
      aiService.verifyAvailableModels(),
      aiService.getCategorizationStats(),
    ]);

    res.json({
      success: true,
      data: {
        isConnected: connectionStatus,
        availableModels,
        stats,
        currentModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        aiEnabled: process.env.ENABLE_AI_CATEGORIZATION === 'true',
      },
    });
  } catch (error) {
    logger.error('Failed to get AI service status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get AI service status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// New endpoint to bulk recategorize existing expenses
export const bulkRecategorize = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { limit = 100, onlyLowConfidence = true } = req.query;

  // Find expenses to recategorize
  const whereClause: any = { userId };
  
  if (onlyLowConfidence === 'true') {
    whereClause.OR = [
      { aiConfidence: null },
      { aiConfidence: { lt: 0.5 } },
    ];
  }

  const expensesToRecategorize = await prisma.expense.findMany({
    where: whereClause,
    take: Number(limit),
    orderBy: { createdAt: 'desc' },
  });

  const results = {
    processed: 0,
    updated: 0,
    failed: 0,
    errors: [] as Array<{ expenseId: string; error: string }>,
  };

  for (const expense of expensesToRecategorize) {
    try {
      results.processed++;

      const aiResult = await performAICategorization({
        description: expense.description,
        merchant: expense.merchant || undefined,
        amount: Number(expense.amount),
        paymentMethod: expense.paymentMethod,
      });

      // Only update if confidence is better than current
      const currentConfidence = expense.aiConfidence || 0;
      if ((aiResult.aiConfidence || 0) > currentConfidence) {
        await prisma.expense.update({
          where: { id: expense.id },
          data: {
            categoryId: aiResult.categoryId,
            aiConfidence: aiResult.aiConfidence,
          },
        });
        results.updated++;
      }

    } catch (error) {
      results.failed++;
      results.errors.push({
        expenseId: expense.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  res.json({
    success: true,
    message: `Bulk recategorization completed: ${results.updated} updated, ${results.failed} failed`,
    data: results,
  });
});