import Bull from 'bull';
import { PrismaClient } from '@prisma/client';
import { aiService } from './aiService';
import { emailService } from './emailService';
import { cacheService } from './cacheService';
import logger from '../utils/logger';

const prisma = new PrismaClient();

// Create job queues
export const aiQueue = new Bull('AI Processing', process.env.REDIS_URL || 'redis://localhost:6379', {
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 5,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const emailQueue = new Bull('Email Processing', process.env.REDIS_URL || 'redis://localhost:6379', {
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 3,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const reportQueue = new Bull('Report Generation', process.env.REDIS_URL || 'redis://localhost:6379', {
  defaultJobOptions: {
    removeOnComplete: 3,
    removeOnFail: 2,
    attempts: 1,
  },
});

// Combined job queue for convenience
export const jobQueue = {
  add: (jobType: string, data: any, options?: Bull.JobOptions) => {
    switch (jobType) {
      case 'categorize-expense':
      case 'learn-from-correction':
      case 'bulk-recategorize':
        return aiQueue.add(jobType, data, options);
      
      case 'send-email':
      case 'send-budget-alert':
      case 'send-monthly-report':
        return emailQueue.add(jobType, data, options);
      
      case 'generate-report':
        return reportQueue.add(jobType, data, options);
      
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }
  },
};

// AI Processing Jobs
aiQueue.process('categorize-expense', 5, async (job) => {
  const { expenseId, expenseData } = job.data;
  
  try {
    logger.info(`Processing AI categorization for expense ${expenseId}`);
    
    // Perform AI categorization
    const aiResult = await aiService.categorizeExpense(expenseData);
    
    // Update expense with AI result
    await prisma.expense.update({
      where: { id: expenseId },
      data: {
        categoryId: aiResult.categoryId,
        aiConfidence: aiResult.confidence,
      },
    });

    // Get userId to invalidate cache
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: { userId: true }
    });

    if (expense) {
      // Invalidate user's caches
      await cacheService.invalidateUser(expense.userId);
    }

    logger.info(`AI categorization completed for expense ${expenseId}: ${aiResult.categoryId} (${aiResult.confidence})`);
    
    return {
      expenseId,
      categoryId: aiResult.categoryId,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning
    };
    
  } catch (error) {
    logger.error(`AI categorization failed for expense ${expenseId}:`, error);
    throw error;
  }
});

aiQueue.process('learn-from-correction', 3, async (job) => {
  const { originalCategoryId, correctedCategoryId, expenseData } = job.data;
  
  try {
    logger.info(`Processing learning from correction: ${originalCategoryId} -> ${correctedCategoryId}`);
    
    await aiService.learnFromCorrection(originalCategoryId, correctedCategoryId, expenseData);
    
    logger.info(`Learning completed successfully`);
    
  } catch (error) {
    logger.error(`Learning from correction failed:`, error);
    throw error;
  }
});

aiQueue.process('bulk-recategorize', 1, async (job) => {
  const { userId, limit, onlyLowConfidence } = job.data;
  
  try {
    logger.info(`Starting bulk recategorization for user ${userId}`);
    
    const whereClause: any = { userId };
    
    if (onlyLowConfidence) {
      whereClause.OR = [
        { aiConfidence: null },
        { aiConfidence: { lt: 0.5 } },
      ];
    }

    const expensesToRecategorize = await prisma.expense.findMany({
      where: whereClause,
      select: {
        id: true,
        description: true,
        merchant: true,
        amount: true,
        paymentMethod: true,
        aiConfidence: true,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const results = {
      processed: 0,
      updated: 0,
      failed: 0,
    };

    // Process in batches to avoid overwhelming the AI service
    const batchSize = 10;
    for (let i = 0; i < expensesToRecategorize.length; i += batchSize) {
      const batch = expensesToRecategorize.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (expense) => {
        try {
          results.processed++;

          const aiResult = await aiService.categorizeExpense({
            description: expense.description,
            merchant: expense.merchant || undefined,
            amount: Number(expense.amount),
            paymentMethod: expense.paymentMethod,
          });

          // Only update if confidence is better than current
          const currentConfidence = expense.aiConfidence || 0;
          if ((aiResult.confidence || 0) > currentConfidence) {
            await prisma.expense.update({
              where: { id: expense.id },
              data: {
                categoryId: aiResult.categoryId,
                aiConfidence: aiResult.confidence,
              },
            });
            results.updated++;
          }

        } catch (error) {
          results.failed++;
          logger.error(`Failed to recategorize expense ${expense.id}:`, error);
        }
      });

      await Promise.allSettled(batchPromises);
      
      // Update job progress
      job.progress((i + batch.length) / expensesToRecategorize.length * 100);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Invalidate user caches
    await cacheService.invalidateUser(userId);

    logger.info(`Bulk recategorization completed for user ${userId}: ${results.updated} updated, ${results.failed} failed`);
    
    return results;
    
  } catch (error) {
    logger.error(`Bulk recategorization failed for user ${userId}:`, error);
    throw error;
  }
});

// Email Processing Jobs
emailQueue.process('send-email', 10, async (job) => {
  const { type, to, data } = job.data;
  
  try {
    let success = false;
    
    switch (type) {
      case 'welcome':
        success = await emailService.sendWelcomeEmail(to, data.userName);
        break;
      
      case 'budget-alert':
        success = await emailService.sendBudgetAlert(to, data.userName, data.alert);
        break;
      
      case 'monthly-report':
        success = await emailService.sendMonthlyReport(to, data.userName, data.reportData);
        break;
      
      case 'password-reset':
        success = await emailService.sendPasswordResetEmail(to, data.resetToken);
        break;
      
      default:
        throw new Error(`Unknown email type: ${type}`);
    }
    
    if (!success) {
      throw new Error(`Failed to send ${type} email to ${to}`);
    }
    
    logger.info(`Email sent successfully: ${type} to ${to}`);
    
  } catch (error) {
    logger.error(`Email sending failed:`, error);
    throw error;
  }
});

emailQueue.process('send-budget-alert', 5, async (job) => {
  const { userId, budgetId } = job.data;
  
  try {
    // Get user and budget info
    const [user, budget] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true }
      }),
      prisma.budget.findUnique({
        where: { id: budgetId },
        include: {
          category: { select: { name: true } }
        }
      })
    ]);

    if (!user || !budget) {
      throw new Error('User or budget not found');
    }

    // Calculate current spending
    const expenses = await prisma.expense.aggregate({
      where: {
        userId,
        categoryId: budget.categoryId,
        transactionDate: {
          gte: budget.startDate,
          lte: budget.endDate,
        },
      },
      _sum: { amount: true },
    });

    const spent = Number(expenses._sum.amount) || 0;
    const percentage = (spent / Number(budget.amount)) * 100;

    const alert = {
      categoryName: budget.category.name,
      budgetAmount: Number(budget.amount),
      spent,
      percentage,
    };

    await emailService.sendBudgetAlert(user.email, user.firstName, alert);
    
    logger.info(`Budget alert sent to ${user.email} for category ${alert.categoryName}`);
    
  } catch (error) {
    logger.error(`Budget alert failed:`, error);
    throw error;
  }
});

// Report Generation Jobs
reportQueue.process('generate-report', 2, async (job) => {
  const { reportId, userId } = job.data;
  
  try {
    logger.info(`Generating report ${reportId} for user ${userId}`);
    
    // Update job progress
    job.progress(10);
    
    // Get report details
    const report = await prisma.report.findUnique({
      where: { id: reportId }
    });

    if (!report) {
      throw new Error('Report not found');
    }

    job.progress(30);

    // Generate report data (this would call your existing report generation logic)
    // For now, just simulate the process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    job.progress(80);

    // Update report status
    await prisma.report.update({
      where: { id: reportId },
      data: {
        // You would set the actual file path here
        filePath: `/reports/${reportId}.pdf`,
      }
    });

    job.progress(100);
    
    logger.info(`Report ${reportId} generated successfully`);
    
    return { reportId, status: 'completed' };
    
  } catch (error) {
    logger.error(`Report generation failed for ${reportId}:`, error);
    throw error;
  }
});

// Job event handlers
aiQueue.on('completed', (job, result) => {
  logger.debug(`AI job ${job.id} completed:`, result);
});

aiQueue.on('failed', (job, err) => {
  logger.error(`AI job ${job.id} failed:`, err);
});

emailQueue.on('completed', (job, result) => {
  logger.debug(`Email job ${job.id} completed`);
});

emailQueue.on('failed', (job, err) => {
  logger.error(`Email job ${job.id} failed:`, err);
});

reportQueue.on('completed', (job, result) => {
  logger.debug(`Report job ${job.id} completed:`, result);
});

reportQueue.on('failed', (job, err) => {
  logger.error(`Report job ${job.id} failed:`, err);
});

// Queue monitoring
export function getQueueStats() {
  return Promise.all([
    aiQueue.getJobCounts(),
    emailQueue.getJobCounts(),
    reportQueue.getJobCounts(),
  ]).then(([ai, email, report]) => ({
    ai,
    email,
    report,
  }));
}

// Graceful shutdown
export async function closeQueues() {
  await Promise.all([
    aiQueue.close(),
    emailQueue.close(),
    reportQueue.close(),
  ]);
  logger.info('All queues closed');
}