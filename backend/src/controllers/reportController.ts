import { Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../types/auth';
import { asyncHandler } from '../middleware/errorHandler';
import logger from '../utils/logger';

const prisma = new PrismaClient();

const createReportSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  type: z.enum(['monthly', 'quarterly', 'yearly', 'custom']),
  parameters: z.object({
    startDate: z.string(),
    endDate: z.string(),
    categories: z.array(z.string()).optional(),
    includeCharts: z.boolean().default(true),
    groupBy: z.enum(['day', 'week', 'month', 'category']).default('month'),
  }),
  isScheduled: z.boolean().default(false),
  scheduleConfig: z.object({
    frequency: z.enum(['weekly', 'monthly', 'quarterly']),
    dayOfWeek: z.number().optional(),
    dayOfMonth: z.number().optional(),
  }).optional(),
});

export const getReports = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const {
    page = 1,
    limit = 10,
    type,
    status,
  } = req.query;

  const skip = (Number(page) - 1) * Number(limit);
  const where: any = { userId };

  if (type) where.type = type;
  // Note: status would need to be added to the schema for real implementation

  const [reports, totalCount] = await Promise.all([
    prisma.report.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { generatedAt: 'desc' },
    }),
    prisma.report.count({ where }),
  ]);

  // Add mock status for demo
  const reportsWithStatus = reports.map(report => ({
    ...report,
    status: 'completed' as const,
    fileSize: Math.floor(Math.random() * 1000000) + 100000, // Mock file size
    downloadCount: Math.floor(Math.random() * 10), // Mock download count
  }));

  const totalPages = Math.ceil(totalCount / Number(limit));

  res.json({
    success: true,
    data: {
      reports: reportsWithStatus,
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

export const createReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const validatedData = createReportSchema.parse(req.body);

  const report = await prisma.report.create({
    data: {
      userId,
      name: validatedData.name,
      type: validatedData.type,
      parameters: validatedData.parameters,
      isScheduled: validatedData.isScheduled,
      scheduleConfig: validatedData.scheduleConfig,
    },
  });

  logger.info(`Report created: ${report.id} for user ${userId}`);

  res.status(201).json({
    success: true,
    message: 'Report created successfully',
    data: { report },
  });
});

export const generateReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const report = await prisma.report.findFirst({
    where: { id, userId },
  });

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Report not found',
    });
  }

  // Generate report data based on parameters
  const reportData = await generateReportData(userId, report.parameters as any);

  res.json({
    success: true,
    message: 'Report generated successfully',
    data: {
      report: {
        ...report,
        status: 'completed',
      },
      data: reportData,
    },
  });
});

export const getReportData = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const parameters = req.body;

  const reportData = await generateReportData(userId, parameters);

  res.json({
    success: true,
    data: reportData,
  });
});

export const deleteReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const report = await prisma.report.findFirst({
    where: { id, userId },
  });

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Report not found',
    });
  }

  await prisma.report.delete({ where: { id } });

  logger.info(`Report deleted: ${id} by user ${userId}`);

  res.json({
    success: true,
    message: 'Report deleted successfully',
  });
});

// Helper function to generate report data
async function generateReportData(userId: string, parameters: any) {
  const startDate = new Date(parameters.startDate);
  const endDate = new Date(parameters.endDate);

  const where: any = {
    userId,
    transactionDate: {
      gte: startDate,
      lte: endDate,
    },
  };

  if (parameters.categories && parameters.categories.length > 0) {
    where.categoryId = { in: parameters.categories };
  }

  // Get all expenses for the period
  const expenses = await prisma.expense.findMany({
    where,
    include: {
      category: {
        select: { name: true, color: true },
      },
    },
  });

  // Calculate summary
  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const transactionCount = expenses.length;
  const averageTransaction = transactionCount > 0 ? totalExpenses / transactionCount : 0;

  // Category breakdown
  const categoryMap = new Map();
  expenses.forEach(expense => {
    const categoryName = expense.category.name;
    const existing = categoryMap.get(categoryName) || { total: 0, count: 0, color: expense.category.color };
    categoryMap.set(categoryName, {
      total: existing.total + Number(expense.amount),
      count: existing.count + 1,
      color: expense.category.color,
    });
  });

  const categoryBreakdown = Array.from(categoryMap.entries()).map(([categoryName, data]) => ({
    categoryName,
    total: data.total,
    count: data.count,
    percentage: (data.total / totalExpenses) * 100,
    color: data.color,
  })).sort((a, b) => b.total - a.total);

  // Monthly trends
  const monthlyMap = new Map();
  expenses.forEach(expense => {
    const month = expense.transactionDate.toISOString().substring(0, 7); // YYYY-MM
    const existing = monthlyMap.get(month) || { total: 0, count: 0 };
    monthlyMap.set(month, {
      total: existing.total + Number(expense.amount),
      count: existing.count + 1,
    });
  });

  const monthlyTrends = Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month: month + '-01', // Add day for proper date parsing
    total: data.total,
    count: data.count,
  })).sort((a, b) => a.month.localeCompare(b.month));

  // Top merchants
  const merchantMap = new Map();
  expenses.forEach(expense => {
    if (expense.merchant) {
      const existing = merchantMap.get(expense.merchant) || { total: 0, count: 0 };
      merchantMap.set(expense.merchant, {
        total: existing.total + Number(expense.amount),
        count: existing.count + 1,
      });
    }
  });

  const topMerchants = Array.from(merchantMap.entries()).map(([merchant, data]) => ({
    merchant,
    total: data.total,
    count: data.count,
  })).sort((a, b) => b.total - a.total).slice(0, 10);

  // Payment methods
  const paymentMap = new Map();
  expenses.forEach(expense => {
    const method = expense.paymentMethod.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    const existing = paymentMap.get(method) || { total: 0, count: 0 };
    paymentMap.set(method, {
      total: existing.total + Number(expense.amount),
      count: existing.count + 1,
    });
  });

  const paymentMethods = Array.from(paymentMap.entries()).map(([method, data]) => ({
    method,
    total: data.total,
    count: data.count,
    percentage: (data.total / totalExpenses) * 100,
  })).sort((a, b) => b.total - a.total);

  return {
    summary: {
      totalExpenses,
      transactionCount,
      averageTransaction,
      dateRange: {
        startDate: parameters.startDate,
        endDate: parameters.endDate,
      },
    },
    categoryBreakdown,
    monthlyTrends,
    topMerchants,
    paymentMethods,
  };
}
