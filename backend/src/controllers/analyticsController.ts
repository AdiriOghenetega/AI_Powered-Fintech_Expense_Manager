// backend/src/controllers/analyticsController.ts
import { Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../types/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { budgetService } from '../services/budgetService';

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
    _avg: { amount: true },
  });

  // Last month expenses for comparison
  const lastMonthExpenses = await prisma.expense.aggregate({
    where: {
      userId,
      transactionDate: { gte: startOfLastMonth, lte: endOfLastMonth },
    },
    _sum: { amount: true },
    _count: true,
    _avg: { amount: true },
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
    _avg: { amount: true },
  });

  // Get category details
  const categoryIds = categoryBreakdown.map(cb => cb.categoryId);
  const categoryDetails = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true, color: true, icon: true },
  });

  // Recent transactions
  const recentTransactions = await prisma.expense.findMany({
    where: { userId },
    orderBy: { transactionDate: 'desc' },
    take: 10,
    include: {
      category: {
        select: { name: true, color: true, icon: true },
      },
    },
  });

  // Get real budget status from budget service
  const budgets = await budgetService.getUserBudgets(userId);
  const budgetStatus = budgets.slice(0, 5).map(budget => ({
    id: budget.id,
    amount: budget.budgetAmount,
    spent: budget.spent,
    remaining: budget.remaining,
    percentage: budget.percentage,
    category: {
      name: budget.category.name,
      color: budget.category.color,
    },
    status: budget.status,
  }));

  // Calculate trends
  const currentTotal = Number(currentMonthExpenses._sum.amount) || 0;
  const lastTotal = Number(lastMonthExpenses._sum.amount) || 0;
  const totalChange = lastTotal > 0 ? ((currentTotal - lastTotal) / lastTotal) * 100 : 0;

  const currentCount = currentMonthExpenses._count;
  const lastCount = lastMonthExpenses._count;
  const countChange = lastCount > 0 ? ((currentCount - lastCount) / lastCount) * 100 : 0;

  const currentAvg = Number(currentMonthExpenses._avg.amount) || 0;
  const lastAvg = Number(lastMonthExpenses._avg.amount) || 0;
  const avgChange = lastAvg > 0 ? ((currentAvg - lastAvg) / lastAvg) * 100 : 0;

  // Merge category data
  const categoriesWithTotals = categoryBreakdown.map(cb => {
    const category = categoryDetails.find(cd => cd.id === cb.categoryId);
    return {
      categoryId: cb.categoryId,
      categoryName: category?.name || 'Unknown',
      categoryColor: category?.color || '#6B7280',
      categoryIcon: category?.icon || 'folder',
      total: Number(cb._sum.amount) || 0,
      count: cb._count,
      average: Number(cb._avg.amount) || 0,
    };
  }).sort((a, b) => b.total - a.total);

  // Calculate spending velocity (last 7 days vs previous 7 days)
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const previous7Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [recent7Days, previous7DaysData] = await Promise.all([
    prisma.expense.aggregate({
      where: {
        userId,
        transactionDate: { gte: last7Days, lte: now },
      },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: {
        userId,
        transactionDate: { gte: previous7Days, lt: last7Days },
      },
      _sum: { amount: true },
    }),
  ]);

  const recent7DaysTotal = Number(recent7Days._sum.amount) || 0;
  const previous7DaysTotal = Number(previous7DaysData._sum.amount) || 0;
  const velocityChange = previous7DaysTotal > 0 ? ((recent7DaysTotal - previous7DaysTotal) / previous7DaysTotal) * 100 : 0;

  res.json({
    success: true,
    data: {
      overview: {
        currentMonth: {
          total: currentTotal,
          count: currentCount,
          average: currentAvg,
        },
        lastMonth: {
          total: lastTotal,
          count: lastCount,
          average: lastAvg,
        },
        trends: {
          totalChange,
          countChange,
          avgChange,
          velocityChange,
        },
        velocity: {
          recent7Days: recent7DaysTotal,
          previous7Days: previous7DaysTotal,
        },
      },
      categoryBreakdown: categoriesWithTotals,
      recentTransactions: recentTransactions.map(tx => ({
        ...tx,
        amount: Number(tx.amount),
      })),
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

  if (categories && categories.length > 0 && categories[0]) {
    where.categoryId = { in: categories };
  }

  if (groupBy === 'category') {
    const groupedData = await prisma.expense.groupBy({
      by: ['categoryId'],
      where,
      _sum: { amount: true },
      _count: true,
      _avg: { amount: true },
    });

    const categoryDetails = await prisma.category.findMany({
      where: { id: { in: groupedData.map(g => g.categoryId) } },
      select: { id: true, name: true, color: true, icon: true },
    });

    const result = groupedData.map(g => {
      const category = categoryDetails.find(c => c.id === g.categoryId);
      return {
        key: category?.name || 'Unknown',
        value: Number(g._sum.amount) || 0,
        count: g._count,
        average: Number(g._avg.amount) || 0,
        color: category?.color || '#6B7280',
        icon: category?.icon || 'folder',
      };
    }).sort((a, b) => b.value - a.value);

    return res.json({
      success: true,
      data: { trends: result, groupBy, period, dateRange },
    });
  }

  if (groupBy === 'paymentMethod') {
    const groupedData = await prisma.expense.groupBy({
      by: ['paymentMethod'],
      where,
      _sum: { amount: true },
      _count: true,
      _avg: { amount: true },
    });

    const result = groupedData.map(g => ({
      key: g.paymentMethod.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
      value: Number(g._sum.amount) || 0,
      count: g._count,
      average: Number(g._avg.amount) || 0,
    })).sort((a, b) => b.value - a.value);

    return res.json({
      success: true,
      data: { trends: result, groupBy, period, dateRange },
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
  const timeGroups = new Map<string, { total: number; count: number; amounts: number[] }>();

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

    const existing = timeGroups.get(key) || { total: 0, count: 0, amounts: [] };
    const amount = Number(expense.amount);
    timeGroups.set(key, {
      total: existing.total + amount,
      count: existing.count + 1,
      amounts: [...existing.amounts, amount],
    });
  });

  const result = Array.from(timeGroups.entries()).map(([key, data]) => ({
    key,
    value: data.total,
    count: data.count,
    average: data.count > 0 ? data.total / data.count : 0,
    median: calculateMedian(data.amounts),
  })).sort((a, b) => a.key.localeCompare(b.key));

  res.json({
    success: true,
    data: { trends: result, groupBy, period, dateRange },
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
    _min: { amount: true },
    _max: { amount: true },
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

  // Get monthly breakdown for trend analysis
  const monthlyBreakdown = await prisma.$queryRaw<Array<{
    category_id: string;
    month: string;
    total: number;
    count: number;
  }>>`
    SELECT 
      category_id,
      TO_CHAR(transaction_date, 'YYYY-MM') as month,
      SUM(amount)::float as total,
      COUNT(*)::int as count
    FROM expenses 
    WHERE user_id = ${userId}
      AND transaction_date >= ${last6Months}
      AND transaction_date <= ${now}
    GROUP BY category_id, TO_CHAR(transaction_date, 'YYYY-MM')
    ORDER BY month DESC
  `;

  // Combine data
  const analysis = categories.map(category => {
    const current = currentMonth.find(c => c.categoryId === category.id);
    const historical = last6MonthsData.find(c => c.categoryId === category.id);

    const currentTotal = Number(current?._sum.amount || 0);
    const historicalTotal = Number(historical?._sum.amount || 0);
    const historicalAvg = historicalTotal / 6; // 6 months average

    // Get monthly trend for this category
    const monthlyTrend = monthlyBreakdown
      .filter(m => m.category_id === category.id)
      .map(m => ({
        month: m.month,
        total: m.total,
        count: m.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Calculate trend direction
    const recentMonths = monthlyTrend.slice(-3);
    const isIncreasing = recentMonths.length >= 2 && 
      recentMonths[recentMonths.length - 1].total > recentMonths[0].total;

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
        min: Number(current?._min.amount || 0),
        max: Number(current?._max.amount || 0),
      },
      historical: {
        total: historicalTotal,
        count: historical?._count || 0,
        average: Number(historical?._avg.amount || 0),
        monthlyAverage: historicalAvg,
      },
      trends: {
        totalChange: historicalAvg > 0 ? ((currentTotal - historicalAvg) / historicalAvg) * 100 : 0,
        isIncreasing,
        monthlyData: monthlyTrend,
      },
      insights: generateCategoryInsights(currentTotal, historicalAvg, current?._count || 0, historical?._count || 0),
    };
  }).sort((a, b) => b.currentMonth.total - a.currentMonth.total);

  res.json({
    success: true,
    data: { analysis },
  });
});

export const getBudgetPerformance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { period = 'MONTHLY' } = req.query;

  // Use the budget service to get real budget performance
  const budgets = await budgetService.getUserBudgets(userId, period as any);

  const budgetPerformance = budgets.map(budget => ({
    budget: {
      id: budget.id,
      amount: budget.budgetAmount,
      period: budget.period,
      startDate: budget.startDate,
      endDate: budget.endDate,
    },
    category: {
      name: budget.category.name,
      color: budget.category.color,
    },
    performance: {
      spent: budget.spent,
      remaining: budget.remaining,
      percentage: budget.percentage,
      transactionCount: budget.transactions,
      averageTransaction: budget.averageTransaction,
    },
    timeline: {
      daysPassed: Math.ceil((new Date().getTime() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24)),
      daysRemaining: budget.projection.daysRemaining,
      totalDays: Math.ceil((budget.endDate.getTime() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24)),
      progressPercentage: (Math.ceil((new Date().getTime() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24)) / 
                           Math.ceil((budget.endDate.getTime() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24))) * 100,
    },
    projection: {
      avgDailySpending: budget.projection.dailyAverage,
      projectedTotal: budget.projection.estimatedTotal,
      projectedOverage: Math.max(0, budget.projection.estimatedTotal - budget.budgetAmount),
      onTrack: budget.projection.onTrack,
    },
    status: budget.status,
  }));

  res.json({
    success: true,
    data: { budgetPerformance },
  });
});

export const getSpendingInsights = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const previous30Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Get spending patterns
  const [currentPeriod, previousPeriod, weekdaySpending, weekendSpending] = await Promise.all([
    prisma.expense.aggregate({
      where: {
        userId,
        transactionDate: { gte: last30Days, lte: now },
      },
      _sum: { amount: true },
      _count: true,
      _avg: { amount: true },
    }),

    prisma.expense.aggregate({
      where: {
        userId,
        transactionDate: { gte: previous30Days, lt: last30Days },
      },
      _sum: { amount: true },
      _count: true,
      _avg: { amount: true },
    }),

    // Weekday spending (Monday-Friday)
    prisma.$queryRaw<Array<{ total: number }>>`
      SELECT SUM(amount)::float as total
      FROM expenses 
      WHERE user_id = ${userId}
        AND transaction_date >= ${last30Days}
        AND transaction_date <= ${now}
        AND EXTRACT(DOW FROM transaction_date) BETWEEN 1 AND 5
    `,

    // Weekend spending (Saturday-Sunday)
    prisma.$queryRaw<Array<{ total: number }>>`
      SELECT SUM(amount)::float as total
      FROM expenses 
      WHERE user_id = ${userId}
        AND transaction_date >= ${last30Days}
        AND transaction_date <= ${now}
        AND EXTRACT(DOW FROM transaction_date) IN (0, 6)
    `,
  ]);

  // Get top merchants
  const topMerchants = await prisma.expense.groupBy({
    by: ['merchant'],
    where: {
      userId,
      transactionDate: { gte: last30Days, lte: now },
      merchant: { not: null },
    },
    _sum: { amount: true },
    _count: true,
    orderBy: {
      _sum: {
        amount: 'desc',
      },
    },
    take: 10,
  });

  // Get unusual spending patterns
  const unusualSpending = await findUnusualSpending(userId, last30Days, now);

  const insights = {
    period: {
      current: {
        total: Number(currentPeriod._sum.amount) || 0,
        count: currentPeriod._count,
        average: Number(currentPeriod._avg.amount) || 0,
      },
      previous: {
        total: Number(previousPeriod._sum.amount) || 0,
        count: previousPeriod._count,
        average: Number(previousPeriod._avg.amount) || 0,
      },
      change: {
        total: calculatePercentageChange(
          Number(previousPeriod._sum.amount) || 0,
          Number(currentPeriod._sum.amount) || 0
        ),
        count: calculatePercentageChange(
          previousPeriod._count,
          currentPeriod._count
        ),
        average: calculatePercentageChange(
          Number(previousPeriod._avg.amount) || 0,
          Number(currentPeriod._avg.amount) || 0
        ),
      },
    },
    weekdayVsWeekend: {
      weekday: weekdaySpending[0]?.total || 0,
      weekend: weekendSpending[0]?.total || 0,
      ratio: (weekendSpending[0]?.total || 0) / (weekdaySpending[0]?.total || 1),
    },
    topMerchants: topMerchants.map(m => ({
      merchant: m.merchant,
      total: Number(m._sum.amount) || 0,
      count: m._count,
    })),
    unusual: unusualSpending,
  };

  res.json({
    success: true,
    data: { insights },
  });
});

// Helper functions
function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function generateCategoryInsights(currentTotal: number, historicalAvg: number, currentCount: number, historicalCount: number): string[] {
  const insights: string[] = [];
  
  const totalChange = historicalAvg > 0 ? ((currentTotal - historicalAvg) / historicalAvg) * 100 : 0;
  const countChange = historicalCount > 0 ? ((currentCount - (historicalCount / 6)) / (historicalCount / 6)) * 100 : 0;

  if (Math.abs(totalChange) > 50) {
    insights.push(totalChange > 0 ? 'Significant increase in spending' : 'Significant decrease in spending');
  }

  if (Math.abs(countChange) > 30) {
    insights.push(countChange > 0 ? 'More frequent transactions' : 'Fewer transactions than usual');
  }

  if (currentTotal === 0 && historicalAvg > 0) {
    insights.push('No spending this month in this category');
  }

  return insights;
}

function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

async function findUnusualSpending(userId: string, startDate: Date, endDate: Date): Promise<Array<{
  type: string;
  description: string;
  amount?: number;
  category?: string;
}>> {
  const unusual: Array<{ type: string; description: string; amount?: number; category?: string }> = [];

  // Find unusually large transactions (> 3x average)
  const avgExpense = await prisma.expense.aggregate({
    where: {
      userId,
      transactionDate: { gte: new Date(startDate.getTime() - 90 * 24 * 60 * 60 * 1000), lt: startDate },
    },
    _avg: { amount: true },
  });

  const avgAmount = Number(avgExpense._avg.amount) || 0;
  const threshold = avgAmount * 3;

  if (threshold > 0) {
    const largeExpenses = await prisma.expense.findMany({
      where: {
        userId,
        transactionDate: { gte: startDate, lte: endDate },
        amount: { gte: threshold },
      },
      include: {
        category: { select: { name: true } },
      },
      take: 5,
    });

    largeExpenses.forEach(expense => {
      unusual.push({
        type: 'large_transaction',
        description: `Unusually large expense: ${expense.description}`,
        amount: Number(expense.amount),
        category: expense.category.name,
      });
    });
  }

  // Find new merchants (not seen in previous 90 days)
  const newMerchants = await prisma.$queryRaw<Array<{ merchant: string; total: number }>>`
    SELECT merchant, SUM(amount)::float as total
    FROM expenses 
    WHERE user_id = ${userId}
      AND transaction_date >= ${startDate}
      AND transaction_date <= ${endDate}
      AND merchant IS NOT NULL
      AND merchant NOT IN (
        SELECT DISTINCT merchant 
        FROM expenses 
        WHERE user_id = ${userId}
          AND transaction_date >= ${new Date(startDate.getTime() - 90 * 24 * 60 * 60 * 1000)}
          AND transaction_date < ${startDate}
          AND merchant IS NOT NULL
      )
    GROUP BY merchant
    ORDER BY total DESC
    LIMIT 3
  `;

  newMerchants.forEach(merchant => {
    unusual.push({
      type: 'new_merchant',
      description: `New merchant: ${merchant.merchant}`,
      amount: merchant.total,
    });
  });

  return unusual;
}