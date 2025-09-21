import { Response } from 'express';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import { AuthRequest } from '../types/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { budgetService } from '../services/budgetService';
import { cacheService } from '../services/cacheService';
import logger from '../utils/logger';

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
  const cacheKey = cacheService.generateKey('overview', userId, 'v2');
  
  // Check cache first
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  try {
    // Single optimized query for monthly comparison
    const monthlyStatsRaw = await prisma.$queryRaw<Array<{
      month: string;
      total: number;
      count: number;
      average: number;
    }>>`
      SELECT 
        TO_CHAR(transaction_date, 'YYYY-MM') as month,
        SUM(amount)::float as total,
        COUNT(*)::int as count,
        AVG(amount)::float as average
      FROM expenses 
      WHERE user_id = ${userId}
        AND transaction_date >= ${startOfLastMonth}
        AND transaction_date <= ${now}
      GROUP BY TO_CHAR(transaction_date, 'YYYY-MM')
      ORDER BY month DESC
    `;

    // Optimized category breakdown with JOIN
    const categoryBreakdownRaw = await prisma.$queryRaw<Array<{
      category_id: string;
      category_name: string;
      category_color: string;
      category_icon: string;
      total: number;
      count: number;
      average: number;
    }>>`
      SELECT 
        c.id as category_id,
        c.name as category_name,
        c.color as category_color,
        c.icon as category_icon,
        SUM(e.amount)::float as total,
        COUNT(e.*)::int as count,
        AVG(e.amount)::float as average
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ${userId}
        AND e.transaction_date >= ${startOfMonth}
        AND e.transaction_date <= ${now}
      GROUP BY c.id, c.name, c.color, c.icon
      ORDER BY total DESC
      LIMIT 10
    `;

    // Parallel execution for remaining data
    const [recentTransactions, budgetStatus, velocityData] = await Promise.all([
      // Recent transactions with optimized select
      prisma.expense.findMany({
        where: { 
          userId,
          transactionDate: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
        },
        select: {
          id: true,
          amount: true,
          description: true,
          transactionDate: true,
          merchant: true,
          category: {
            select: { name: true, color: true, icon: true }
          }
        },
        orderBy: { transactionDate: 'desc' },
        take: 10
      }),

      // Budget status (cached separately)
      budgetService.getUserBudgets(userId, 'MONTHLY'),

      // Velocity calculation (last 7 vs previous 7 days)
      prisma.$queryRaw<Array<{
        period: string;
        total: number;
      }>>`
        SELECT 
          CASE 
            WHEN transaction_date >= ${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)} THEN 'recent'
            ELSE 'previous'
          END as period,
          SUM(amount)::float as total
        FROM expenses 
        WHERE user_id = ${userId}
          AND transaction_date >= ${new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)}
        GROUP BY 
          CASE 
            WHEN transaction_date >= ${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)} THEN 'recent'
            ELSE 'previous'
          END
      `
    ]);

    // Process monthly stats
    const currentMonthData = monthlyStatsRaw.find(m => m.month === now.toISOString().slice(0, 7));
    const lastMonthData = monthlyStatsRaw.find(m => m.month === startOfLastMonth.toISOString().slice(0, 7));

    const currentMonth = {
      total: currentMonthData?.total || 0,
      count: currentMonthData?.count || 0,
      average: currentMonthData?.average || 0,
    };

    const lastMonth = {
      total: lastMonthData?.total || 0,
      count: lastMonthData?.count || 0,
      average: lastMonthData?.average || 0,
    };

    // Calculate trends
    const trends = {
      totalChange: lastMonth.total > 0 ? ((currentMonth.total - lastMonth.total) / lastMonth.total) * 100 : 0,
      countChange: lastMonth.count > 0 ? ((currentMonth.count - lastMonth.count) / lastMonth.count) * 100 : 0,
      avgChange: lastMonth.average > 0 ? ((currentMonth.average - lastMonth.average) / lastMonth.average) * 100 : 0,
      velocityChange: calculateVelocityChange(velocityData),
    };

    // Process category breakdown
    const categoriesWithTotals = categoryBreakdownRaw.map(cb => ({
      categoryId: cb.category_id,
      categoryName: cb.category_name,
      categoryColor: cb.category_color,
      categoryIcon: cb.category_icon,
      total: cb.total,
      count: cb.count,
      average: cb.average,
    }));

    // Process budget status
    const budgetStatusProcessed = budgetStatus.slice(0, 5).map(budget => ({
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

    const response = {
      success: true,
      data: {
        overview: {
          currentMonth,
          lastMonth,
          trends,
          velocity: {
            recent7Days: velocityData.find(v => v.period === 'recent')?.total || 0,
            previous7Days: velocityData.find(v => v.period === 'previous')?.total || 0,
          },
        },
        categoryBreakdown: categoriesWithTotals,
        recentTransactions: recentTransactions.map(tx => ({
          ...tx,
          amount: Number(tx.amount),
        })),
        budgetStatus: budgetStatusProcessed,
      },
    };

    // Cache for 5 minutes
    await cacheService.set(cacheKey, response, { ttl: 300 });

    res.json(response);
  } catch (error) {
    logger.error('Overview query failed:', error);
    throw error;
  }
});

export const getTrends = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const validatedQuery = analyticsQuerySchema.parse(req.query);
  const { period, startDate, endDate, categories, groupBy } = validatedQuery;

  const cacheKey = cacheService.generateKey('trends', userId, period, groupBy, JSON.stringify(categories));
  
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

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

  let result;

  if (groupBy === 'category') {
    // Optimized category grouping with single query
    const categoryData = await prisma.$queryRaw<Array<{
      category_id: string;
      category_name: string;
      category_color: string;
      category_icon: string;
      total: number;
      count: number;
      average: number;
    }>>`
      SELECT 
        c.id as category_id,
        c.name as category_name,
        c.color as category_color,
        c.icon as category_icon,
        SUM(e.amount)::float as total,
        COUNT(e.*)::int as count,
        AVG(e.amount)::float as average
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ${userId}
        AND e.transaction_date >= ${dateRange.gte}
        AND e.transaction_date <= ${dateRange.lte}
        ${categories && categories.length > 0 ? Prisma.sql`AND e.category_id = ANY(${categories})` : Prisma.empty}
      GROUP BY c.id, c.name, c.color, c.icon
      ORDER BY total DESC
    `;

    result = categoryData.map(item => ({
      key: item.category_name,
      value: item.total,
      count: item.count,
      average: item.average,
      color: item.category_color,
      icon: item.category_icon,
    }));

  } else if (groupBy === 'paymentMethod') {
    // Optimized payment method grouping
    const paymentData = await prisma.$queryRaw<Array<{
      payment_method: string;
      total: number;
      count: number;
      average: number;
    }>>`
      SELECT 
        payment_method,
        SUM(amount)::float as total,
        COUNT(*)::int as count,
        AVG(amount)::float as average
      FROM expenses
      WHERE user_id = ${userId}
        AND transaction_date >= ${dateRange.gte}
        AND transaction_date <= ${dateRange.lte}
        ${categories && categories.length > 0 ? Prisma.sql`AND category_id = ANY(${categories})` : Prisma.empty}
      GROUP BY payment_method
      ORDER BY total DESC
    `;

    result = paymentData.map(item => ({
      key: item.payment_method.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
      value: item.total,
      count: item.count,
      average: item.average,
    }));

  } else {
    // Time-based grouping with optimized query
    let dateFormat: string;
    switch (groupBy) {
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateFormat = 'YYYY-"W"WW';
        break;
      default: // month
        dateFormat = 'YYYY-MM';
    }

    const timeData = await prisma.$queryRaw<Array<{
      period: string;
      total: number;
      count: number;
      average: number;
      amounts: number[];
    }>>`
      SELECT 
        TO_CHAR(transaction_date, ${dateFormat}) as period,
        SUM(amount)::float as total,
        COUNT(*)::int as count,
        AVG(amount)::float as average,
        ARRAY_AGG(amount::float ORDER BY amount) as amounts
      FROM expenses
      WHERE user_id = ${userId}
        AND transaction_date >= ${dateRange.gte}
        AND transaction_date <= ${dateRange.lte}
        ${categories && categories.length > 0 ? Prisma.sql`AND category_id = ANY(${categories})` : Prisma.empty}
      GROUP BY TO_CHAR(transaction_date, ${dateFormat})
      ORDER BY period
    `;

    result = timeData.map(item => ({
      key: item.period,
      value: item.total,
      count: item.count,
      average: item.average,
      median: calculateMedian(item.amounts),
    }));
  }

  const response = {
    success: true,
    data: { trends: result, groupBy, period, dateRange },
  };

  // Cache for 10 minutes
  await cacheService.set(cacheKey, response, { ttl: 600 });
  res.json(response);
});

export const getCategoryAnalysis = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const cacheKey = cacheService.generateKey('category-analysis', userId);
  
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const last6Months = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  try {
    // Single optimized query for category analysis
    const categoryAnalysisRaw = await prisma.$queryRaw<Array<{
      category_id: string;
      category_name: string;
      category_color: string;
      category_icon: string;
      current_total: number;
      current_count: number;
      current_avg: number;
      current_min: number;
      current_max: number;
      historical_total: number;
      historical_count: number;
      historical_avg: number;
    }>>`
      SELECT 
        c.id as category_id,
        c.name as category_name,
        c.color as category_color,
        c.icon as category_icon,
        COALESCE(current_month.total, 0)::float as current_total,
        COALESCE(current_month.count, 0)::int as current_count,
        COALESCE(current_month.avg, 0)::float as current_avg,
        COALESCE(current_month.min, 0)::float as current_min,
        COALESCE(current_month.max, 0)::float as current_max,
        COALESCE(historical.total, 0)::float as historical_total,
        COALESCE(historical.count, 0)::int as historical_count,
        COALESCE(historical.avg, 0)::float as historical_avg
      FROM categories c
      LEFT JOIN (
        SELECT 
          category_id,
          SUM(amount) as total,
          COUNT(*) as count,
          AVG(amount) as avg,
          MIN(amount) as min,
          MAX(amount) as max
        FROM expenses 
        WHERE user_id = ${userId}
          AND transaction_date >= ${startOfMonth}
          AND transaction_date <= ${now}
        GROUP BY category_id
      ) current_month ON c.id = current_month.category_id
      LEFT JOIN (
        SELECT 
          category_id,
          SUM(amount) as total,
          COUNT(*) as count,
          AVG(amount) as avg
        FROM expenses 
        WHERE user_id = ${userId}
          AND transaction_date >= ${last6Months}
          AND transaction_date <= ${now}
        GROUP BY category_id
      ) historical ON c.id = historical.category_id
      WHERE current_month.category_id IS NOT NULL 
         OR historical.category_id IS NOT NULL
      ORDER BY current_total DESC
    `;

    // Get monthly trend data for each category
    const monthlyTrendData = await prisma.$queryRaw<Array<{
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

    // Process analysis data
    const analysis = categoryAnalysisRaw.map(cat => {
      const historicalAvg = cat.historical_total / 6; // 6 months average
      const totalChange = historicalAvg > 0 ? ((cat.current_total - historicalAvg) / historicalAvg) * 100 : 0;
      
      // Get monthly trend for this category
      const categoryTrends = monthlyTrendData
        .filter(m => m.category_id === cat.category_id)
        .map(m => ({
          month: m.month,
          total: m.total,
          count: m.count,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // Calculate trend direction
      const recentMonths = categoryTrends.slice(-3);
      const isIncreasing = recentMonths.length >= 2 && 
        recentMonths[recentMonths.length - 1].total > recentMonths[0].total;

      return {
        category: {
          id: cat.category_id,
          name: cat.category_name,
          color: cat.category_color,
          icon: cat.category_icon,
        },
        currentMonth: {
          total: cat.current_total,
          count: cat.current_count,
          average: cat.current_avg,
          min: cat.current_min,
          max: cat.current_max,
        },
        historical: {
          total: cat.historical_total,
          count: cat.historical_count,
          average: cat.historical_avg,
          monthlyAverage: historicalAvg,
        },
        trends: {
          totalChange,
          isIncreasing,
          monthlyData: categoryTrends,
        },
        insights: generateCategoryInsights(cat.current_total, historicalAvg, cat.current_count, cat.historical_count),
      };
    });

    const response = {
      success: true,
      data: { analysis },
    };

    // Cache for 10 minutes
    await cacheService.set(cacheKey, response, { ttl: 600 });
    res.json(response);
  } catch (error) {
    logger.error('Category analysis query failed:', error);
    throw error;
  }
});

export const getBudgetPerformance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { period = 'MONTHLY' } = req.query;
  
  const cacheKey = cacheService.generateKey('budget-performance', userId, period as string);
  
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
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

    const response = {
      success: true,
      data: { budgetPerformance },
    };

    // Cache for 5 minutes
    await cacheService.set(cacheKey, response, { ttl: 300 });
    res.json(response);
  } catch (error) {
    logger.error('Budget performance query failed:', error);
    throw error;
  }
});

export const getSpendingInsights = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const cacheKey = cacheService.generateKey('spending-insights', userId);
  
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const previous30Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  try {
    // Single optimized query for spending insights
    const insightsRaw = await prisma.$queryRaw<Array<{
      period: string;
      total: number;
      count: number;
      avg: number;
      weekday_total: number;
      weekend_total: number;
    }>>`
      SELECT 
        CASE 
          WHEN transaction_date >= ${last30Days} THEN 'current'
          ELSE 'previous'
        END as period,
        SUM(amount)::float as total,
        COUNT(*)::int as count,
        AVG(amount)::float as avg,
        SUM(CASE WHEN EXTRACT(DOW FROM transaction_date) BETWEEN 1 AND 5 THEN amount ELSE 0 END)::float as weekday_total,
        SUM(CASE WHEN EXTRACT(DOW FROM transaction_date) IN (0, 6) THEN amount ELSE 0 END)::float as weekend_total
      FROM expenses 
      WHERE user_id = ${userId}
        AND transaction_date >= ${previous30Days}
        AND transaction_date <= ${now}
      GROUP BY 
        CASE 
          WHEN transaction_date >= ${last30Days} THEN 'current'
          ELSE 'previous'
        END
    `;

    // Get top merchants in single query
    const topMerchants = await prisma.$queryRaw<Array<{
      merchant: string;
      total: number;
      count: number;
    }>>`
      SELECT 
        merchant,
        SUM(amount)::float as total,
        COUNT(*)::int as count
      FROM expenses 
      WHERE user_id = ${userId}
        AND transaction_date >= ${last30Days}
        AND transaction_date <= ${now}
        AND merchant IS NOT NULL
      GROUP BY merchant
      ORDER BY total DESC
      LIMIT 10
    `;

    // Find unusual spending patterns
    const unusualSpending = await findUnusualSpending(userId, last30Days, now);

    const currentPeriod = insightsRaw.find(p => p.period === 'current');
    const previousPeriod = insightsRaw.find(p => p.period === 'previous');

    const insights = {
      period: {
        current: {
          total: currentPeriod?.total || 0,
          count: currentPeriod?.count || 0,
          average: currentPeriod?.avg || 0,
        },
        previous: {
          total: previousPeriod?.total || 0,
          count: previousPeriod?.count || 0,
          average: previousPeriod?.avg || 0,
        },
        change: {
          total: calculatePercentageChange(previousPeriod?.total || 0, currentPeriod?.total || 0),
          count: calculatePercentageChange(previousPeriod?.count || 0, currentPeriod?.count || 0),
          average: calculatePercentageChange(previousPeriod?.avg || 0, currentPeriod?.avg || 0),
        },
      },
      weekdayVsWeekend: {
        weekday: currentPeriod?.weekday_total || 0,
        weekend: currentPeriod?.weekend_total || 0,
        ratio: (currentPeriod?.weekend_total || 0) / (currentPeriod?.weekday_total || 1),
      },
      topMerchants: topMerchants.map(m => ({
        merchant: m.merchant,
        total: m.total,
        count: m.count,
      })),
      unusual: unusualSpending,
    };

    const response = {
      success: true,
      data: { insights },
    };

    // Cache for 15 minutes
    await cacheService.set(cacheKey, response, { ttl: 900 });
    res.json(response);
  } catch (error) {
    logger.error('Spending insights query failed:', error);
    throw error;
  }
});

// Helper functions
function calculateVelocityChange(velocityData: Array<{ period: string; total: number }>): number {
  const recent = velocityData.find(v => v.period === 'recent')?.total || 0;
  const previous = velocityData.find(v => v.period === 'previous')?.total || 0;
  return previous > 0 ? ((recent - previous) / previous) * 100 : 0;
}

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

  try {
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

    // Find spending spikes (days with unusually high spending)
    const dailySpending = await prisma.$queryRaw<Array<{
      day: string;
      total: number;
      count: number;
    }>>`
      SELECT 
        TO_CHAR(transaction_date, 'YYYY-MM-DD') as day,
        SUM(amount)::float as total,
        COUNT(*)::int as count
      FROM expenses 
      WHERE user_id = ${userId}
        AND transaction_date >= ${startDate}
        AND transaction_date <= ${endDate}
      GROUP BY TO_CHAR(transaction_date, 'YYYY-MM-DD')
      ORDER BY total DESC
      LIMIT 3
    `;

    // Get average daily spending for comparison
    const avgDailySpending = dailySpending.reduce((sum, day) => sum + day.total, 0) / Math.max(dailySpending.length, 1);
    
    dailySpending.forEach(day => {
      if (day.total > avgDailySpending * 2) {
        unusual.push({
          type: 'spending_spike',
          description: `High spending day: ${day.day}`,
          amount: day.total,
        });
      }
    });

    // Find categories with unusual activity
    const categoryActivity = await prisma.$queryRaw<Array<{
      category_name: string;
      current_total: number;
      avg_total: number;
    }>>`
      WITH category_averages AS (
        SELECT 
          c.name as category_name,
          AVG(monthly_total) as avg_total
        FROM (
          SELECT 
            category_id,
            TO_CHAR(transaction_date, 'YYYY-MM') as month,
            SUM(amount) as monthly_total
          FROM expenses 
          WHERE user_id = ${userId}
            AND transaction_date >= ${new Date(startDate.getTime() - 180 * 24 * 60 * 60 * 1000)}
            AND transaction_date < ${startDate}
          GROUP BY category_id, TO_CHAR(transaction_date, 'YYYY-MM')
        ) monthly_data
        JOIN categories c ON monthly_data.category_id = c.id
        GROUP BY c.name
      ),
      current_spending AS (
        SELECT 
          c.name as category_name,
          SUM(e.amount) as current_total
        FROM expenses e
        JOIN categories c ON e.category_id = c.id
        WHERE e.user_id = ${userId}
          AND e.transaction_date >= ${startDate}
          AND e.transaction_date <= ${endDate}
        GROUP BY c.name
      )
      SELECT 
        ca.category_name,
        COALESCE(cs.current_total, 0)::float as current_total,
        ca.avg_total::float as avg_total
      FROM category_averages ca
      LEFT JOIN current_spending cs ON ca.category_name = cs.category_name
      WHERE ca.avg_total > 0 
        AND ABS(COALESCE(cs.current_total, 0) - ca.avg_total) / ca.avg_total > 0.5
      ORDER BY ABS(COALESCE(cs.current_total, 0) - ca.avg_total) DESC
      LIMIT 2
    `;

    categoryActivity.forEach(cat => {
      const change = cat.avg_total > 0 ? ((cat.current_total - cat.avg_total) / cat.avg_total) * 100 : 0;
      unusual.push({
        type: 'category_anomaly',
        description: `Unusual ${cat.category_name} spending: ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change).toFixed(0)}%`,
        amount: cat.current_total,
        category: cat.category_name,
      });
    });

  } catch (error) {
    logger.error('Error finding unusual spending patterns:', error);
  }

  return unusual.slice(0, 5); // Limit to top 5 unusual patterns
}