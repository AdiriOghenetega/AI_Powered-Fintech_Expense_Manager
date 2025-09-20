import { Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../types/auth';
import { asyncHandler } from '../middleware/errorHandler';

const prisma = new PrismaClient();

const analyticsQuerySchema = z.object({
  period: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid start date').optional(),
  endDate: z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid end date').optional(),
  categories: z.string().transform(str => str.split(',')).optional(),
  groupBy: z.enum(['day', 'week', 'month', 'category', 'paymentMethod']).default('month'),
});

export const getOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // Current month expenses
  const currentMonthExpenses = await prisma.expense.aggregate({
    where: {
      userId,
      transactionDate: { gte: startOfMonth, lte: now },
    },
    _sum: { amount: true },
    _count: true,
  });

  // Last month expenses for comparison
  const lastMonthExpenses = await prisma.expense.aggregate({
    where: {
      userId,
      transactionDate: { gte: startOfLastMonth, lte: endOfLastMonth },
    },
    _sum: { amount: true },
    _count: true,
  });

  // Category breakdown for current month
  const categoryBreakdown = await prisma.expense.groupBy({
    by: ['categoryId'],
    where: {
      userId,
      transactionDate: { gte: startOfMonth, lte: now },
    },
    _sum: { amount: true },
    _count: true,
  });

  // Get category details
  const categoryDetails = await prisma.category.findMany({
    where: {
      id: { in: categoryBreakdown.map(cb => cb.categoryId) },
    },
    select: {
      id: true,
      name: true,
      color: true,
      icon: true,
    },
  });

  // Recent transactions
  const recentTransactions = await prisma.expense.findMany({
    where: { userId },
    orderBy: { transactionDate: 'desc' },
    take: 10,
    include: {
      category: {
        select: {
          name: true,
          color: true,
          icon: true,
        },
      },
    },
  });

  // Mock budget status (you can implement real budgets later)
  const budgetStatus = categoryBreakdown.slice(0, 4).map((item, index) => {
    const category = categoryDetails.find(c => c.id === item.categoryId);
    const spent = Number(item._sum.amount || 0);
    const budget = spent * (1.2 + Math.random() * 0.5); // Mock budget
    
    return {
      id: `budget-${index}`,
      amount: budget,
      spent,
      remaining: budget - spent,
      percentage: (spent / budget) * 100,
      category: {
        name: category?.name || 'Unknown',
        color: category?.color || '#6B7280',
      },
    };
  });

  // Calculate trends
  const currentTotal = Number(currentMonthExpenses._sum.amount || 0);
  const lastTotal = Number(lastMonthExpenses._sum.amount || 0);
  const totalChange = lastTotal > 0 ? ((currentTotal - lastTotal) / lastTotal) * 100 : 0;

  const currentCount = currentMonthExpenses._count;
  const lastCount = lastMonthExpenses._count;
  const countChange = lastCount > 0 ? ((currentCount - lastCount) / lastCount) * 100 : 0;

  // Merge category data
  const categoriesWithTotals = categoryBreakdown.map(cb => {
    const category = categoryDetails.find(cd => cd.id === cb.categoryId);
    return {
      categoryId: cb.categoryId,
      categoryName: category?.name || 'Unknown',
      categoryColor: category?.color || '#6B7280',
      categoryIcon: category?.icon || 'folder',
      total: Number(cb._sum.amount || 0),
      count: cb._count,
    };
  }).sort((a, b) => b.total - a.total);

  res.json({
    success: true,
    data: {
      overview: {
        currentMonth: {
          total: currentTotal,
          count: currentCount,
          average: currentCount > 0 ? currentTotal / currentCount : 0,
        },
        lastMonth: {
          total: lastTotal,
          count: lastCount,
          average: lastCount > 0 ? lastTotal / lastCount : 0,
        },
        trends: {
          totalChange,
          countChange,
        },
      },
      categoryBreakdown: categoriesWithTotals,
      recentTransactions,
      budgetStatus,
    },
  });
});

export const getTrends = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const validatedQuery = analyticsQuerySchema.parse(req.query);
  const { period, startDate, endDate, categories, groupBy } = validatedQuery;

  // Calculate date range
  let dateRange: { gte: Date; lte: Date };
  const now = new Date();

  if (startDate && endDate) {
    dateRange = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  } else {
    switch (period) {
      case 'week':
        dateRange = {
          gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          lte: now,
        };
        break;
      case 'quarter':
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        dateRange = {
          gte: quarterStart,
          lte: now,
        };
        break;
      case 'year':
        dateRange = {
          gte: new Date(now.getFullYear(), 0, 1),
          lte: now,
        };
        break;
      default: // month
        dateRange = {
          gte: new Date(now.getFullYear(), now.getMonth() - 5, 1), // Last 6 months
          lte: now,
        };
    }
  }

  const where: any = {
    userId,
    transactionDate: dateRange,
  };

  if (categories && categories.length > 0) {
    where.categoryId = { in: categories };
  }

  if (groupBy === 'category') {
    const groupedData = await prisma.expense.groupBy({
      by: ['categoryId'],
      where,
      _sum: { amount: true },
      _count: true,
    });

    const categoryDetails = await prisma.category.findMany({
      where: { id: { in: groupedData.map(g => g.categoryId) } },
      select: { id: true, name: true, color: true, icon: true },
    });

    const result = groupedData.map(g => {
      const category = categoryDetails.find(c => c.id === g.categoryId);
      return {
        key: category?.name || 'Unknown',
        value: Number(g._sum.amount || 0),
        count: g._count,
        color: category?.color || '#6B7280',
        icon: category?.icon || 'folder',
      };
    }).sort((a, b) => b.value - a.value);

    return res.json({
      success: true,
      data: { trends: result, groupBy, period },
    });
  }

  if (groupBy === 'paymentMethod') {
    const groupedData = await prisma.expense.groupBy({
      by: ['paymentMethod'],
      where,
      _sum: { amount: true },
      _count: true,
    });

    const result = groupedData.map(g => ({
      key: g.paymentMethod.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
      value: Number(g._sum.amount || 0),
      count: g._count,
    })).sort((a, b) => b.value - a.value);

    return res.json({
      success: true,
      data: { trends: result, groupBy, period },
    });
  }

  // Time-based grouping (day, week, month)
  const expenses = await prisma.expense.findMany({
    where,
    select: {
      amount: true,
      transactionDate: true,
    },
    orderBy: { transactionDate: 'asc' },
  });

  // Group by time period
  const timeGroups = new Map<string, { total: number; count: number }>();

  expenses.forEach(expense => {
    let key: string;
    const date = new Date(expense.transactionDate);

    switch (groupBy) {
      case 'day':
        key = date.toISOString().split('T')[0];
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      default: // month
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    const existing = timeGroups.get(key) || { total: 0, count: 0 };
    timeGroups.set(key, {
      total: existing.total + Number(expense.amount),
      count: existing.count + 1,
    });
  });

  const result = Array.from(timeGroups.entries()).map(([key, data]) => ({
    key,
    value: data.total,
    count: data.count,
  })).sort((a, b) => a.key.localeCompare(b.key));

  res.json({
    success: true,
    data: { trends: result, groupBy, period },
  });
});

export const getCategoryAnalysis = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const last6Months = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // Current month category breakdown
  const currentMonth = await prisma.expense.groupBy({
    by: ['categoryId'],
    where: {
      userId,
      transactionDate: { gte: startOfMonth, lte: now },
    },
    _sum: { amount: true },
    _count: true,
    _avg: { amount: true },
  });

  // Last 6 months for trends
  const last6MonthsData = await prisma.expense.groupBy({
    by: ['categoryId'],
    where: {
      userId,
      transactionDate: { gte: last6Months, lte: now },
    },
    _sum: { amount: true },
    _count: true,
    _avg: { amount: true },
  });

  // Get all relevant categories
  const categoryIds = [...new Set([
    ...currentMonth.map(c => c.categoryId),
    ...last6MonthsData.map(c => c.categoryId),
  ])];

  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true, color: true, icon: true },
  });

  // Combine data
  const analysis = categories.map(category => {
    const current = currentMonth.find(c => c.categoryId === category.id);
    const historical = last6MonthsData.find(c => c.categoryId === category.id);

    const currentTotal = Number(current?._sum.amount || 0);
    const historicalTotal = Number(historical?._sum.amount || 0);
    const historicalAvg = historicalTotal / 6; // 6 months average

    return {
      category: {
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
      },
      currentMonth: {
        total: currentTotal,
        count: current?._count || 0,
        average: Number(current?._avg.amount || 0),
      },
      historical: {
        total: historicalTotal,
        count: historical?._count || 0,
        average: Number(historical?._avg.amount || 0),
        monthlyAverage: historicalAvg,
      },
      trends: {
        totalChange: historicalAvg > 0 ? ((currentTotal - historicalAvg) / historicalAvg) * 100 : 0,
        isIncreasing: currentTotal > historicalAvg,
      },
    };
  }).sort((a, b) => b.currentMonth.total - a.currentMonth.total);

  res.json({
    success: true,
    data: { analysis },
  });
});

export const getBudgetPerformance = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Mock budget performance for now
  // In a real app, you'd have a budgets table and real calculations
  
  const userId = req.user!.id;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get current month spending by category
  const categorySpending = await prisma.expense.groupBy({
    by: ['categoryId'],
    where: {
      userId,
      transactionDate: { gte: startOfMonth, lte: now },
    },
    _sum: { amount: true },
    _count: true,
  });

  const categories = await prisma.category.findMany({
    where: { id: { in: categorySpending.map(cs => cs.categoryId) } },
    select: { id: true, name: true, color: true },
  });

  // Mock budget performance data
  const budgetPerformance = categorySpending.slice(0, 4).map((spending, index) => {
    const category = categories.find(c => c.id === spending.categoryId);
    const spent = Number(spending._sum.amount || 0);
    const budgetAmount = spent * (1.3 + Math.random() * 0.7); // Mock budget
    const remaining = budgetAmount - spent;
    const percentage = (spent / budgetAmount) * 100;

    // Mock timeline data
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = now.getDate();
    const daysRemaining = daysInMonth - daysPassed;
    
    const avgDailySpending = spent / daysPassed;
    const projectedTotal = avgDailySpending * daysInMonth;

    return {
      budget: {
        id: `budget-${index}`,
        amount: budgetAmount,
        period: 'MONTHLY',
        startDate: startOfMonth,
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      },
      category: {
        name: category?.name || 'Unknown',
        color: category?.color || '#6B7280',
      },
      performance: {
        spent,
        remaining,
        percentage,
        transactionCount: spending._count,
        averageTransaction: spending._count > 0 ? spent / spending._count : 0,
      },
      timeline: {
        daysPassed,
        daysRemaining,
        totalDays: daysInMonth,
        progressPercentage: (daysPassed / daysInMonth) * 100,
      },
      projection: {
        avgDailySpending,
        projectedTotal,
        projectedOverage: projectedTotal > budgetAmount ? projectedTotal - budgetAmount : 0,
        onTrack: projectedTotal <= budgetAmount,
      },
      status: percentage >= 100 ? 'exceeded' : percentage >= 90 ? 'critical' : percentage >= 75 ? 'caution' : 'good',
    };
  });

  res.json({
    success: true,
    data: { budgetPerformance },
  });
});