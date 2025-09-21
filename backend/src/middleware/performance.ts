import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

interface PerformanceMetrics {
  method: string;
  url: string;
  duration: number;
  statusCode: number;
  userAgent?: string;
  userId?: string;
  memory: NodeJS.MemoryUsage;
}

class PerformanceMonitor {
  private slowThreshold = 1000; // 1 second
  private verySlowThreshold = 3000; // 3 seconds
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 1000;

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = process.hrtime.bigint();
      const startMemory = process.memoryUsage();

      res.on('finish', () => {
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1_000_000; // Convert to milliseconds
        const endMemory = process.memoryUsage();

        const metric: PerformanceMetrics = {
          method: req.method,
          url: req.url,
          duration: Math.round(duration * 100) / 100,
          statusCode: res.statusCode,
          userAgent: req.get('User-Agent'),
          userId: (req as any).user?.id,
          memory: {
            rss: endMemory.rss - startMemory.rss,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
            external: endMemory.external - startMemory.external,
            arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
          }
        };

        // Store metric
        this.addMetric(metric);

        // Set response headers
        res.setHeader('X-Response-Time', `${metric.duration}ms`);

        // Log slow requests
        if (duration > this.verySlowThreshold) {
          logger.error('Very slow request detected', {
            ...metric,
            severity: 'critical'
          });
        } else if (duration > this.slowThreshold) {
          logger.warn('Slow request detected', {
            ...metric,
            severity: 'warning'
          });
        }

        // Log memory spikes
        if (metric.memory.heapUsed > 50 * 1024 * 1024) { // 50MB
          logger.warn('High memory usage detected', {
            method: req.method,
            url: req.url,
            memoryIncrease: `${Math.round(metric.memory.heapUsed / 1024 / 1024)}MB`
          });
        }
      });

      next();
    };
  }

  private addMetric(metric: PerformanceMetrics) {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  getStats() {
    if (this.metrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        slowRequests: 0,
        errorRate: 0
      };
    }

    const slowRequests = this.metrics.filter(m => m.duration > this.slowThreshold).length;
    const errorRequests = this.metrics.filter(m => m.statusCode >= 400).length;
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);

    return {
      totalRequests: this.metrics.length,
      averageResponseTime: Math.round((totalDuration / this.metrics.length) * 100) / 100,
      slowRequests,
      slowRequestsPercentage: Math.round((slowRequests / this.metrics.length) * 100),
      errorRate: Math.round((errorRequests / this.metrics.length) * 100),
      memoryUsage: process.memoryUsage()
    };
  }

  getSlowestEndpoints(limit = 10) {
    return this.metrics
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit)
      .map(m => ({
        endpoint: `${m.method} ${m.url}`,
        duration: m.duration,
        statusCode: m.statusCode
      }));
  }

  reset() {
    this.metrics = [];
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Health check endpoint data
export const healthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health') {
    const stats = performanceMonitor.getStats();
    (req as any).performanceStats = stats;
  }
  next();
};