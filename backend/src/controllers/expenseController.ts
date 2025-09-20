import { Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../types/auth';
import logger from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';

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
});

export const getExpenses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    page = 1,
    limit = 20,
    category,
    startDate,
    endDate,
    search,
    paymentMethod,
    sortBy = 'date',
    sortOrder = 'desc',
  } = req.query;

  const skip = (Number(page) - 1) * Number(limit);
  const where: any = { userId: req.user!.id };

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
    ];
  }
  if (paymentMethod) where.paymentMethod = paymentMethod;

  const [expenses, totalCount] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { transactionDate: sortOrder as 'asc' | 'desc' },
      include: {
        category: {
          select: { id: true, name: true, color: true, icon: true },
        },
      },
    }),
    prisma.expense.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / Number(limit));

  res.json({
    success: true,
    data: {
      expenses,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalCount,
        hasNextPage: Number(page) < totalPages,
        hasPrevPage: Number(page) > 1,
        limit: Number(limit),
      },
    },
  });
});

export const createExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const validatedData = createExpenseSchema.parse(req.body);
  
  // Get default "Other" category if no category provided
  let categoryId = validatedData.categoryId;
  if (!categoryId) {
    const defaultCategory = await prisma.category.findFirst({
      where: { name: 'Other' },
    });
    categoryId = defaultCategory?.id;
  }

  const expense = await prisma.expense.create({
    data: {
      ...validatedData,
      userId: req.user!.id,
      categoryId: categoryId!,
      transactionDate: new Date(validatedData.transactionDate),
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
    data: { expense },
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
    data: { expense: updatedExpense },
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

  // Mock AI categorization - randomly assign a category
  const categories = await prisma.category.findMany();
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];

  const updatedExpense = await prisma.expense.update({
    where: { id },
    data: {
      categoryId: randomCategory.id,
      aiConfidence: 0.85,
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
      expense: updatedExpense,
      aiResult: {
        categoryName: randomCategory.name,
        confidence: 0.85,
      },
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
