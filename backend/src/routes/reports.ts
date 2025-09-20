import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getReports,
  createReport,
  generateReport,
  getReportData,
  deleteReport,
} from '../controllers/reportController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

const reportsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many report requests' },
});

router.use(authenticateToken);
router.use(reportsLimiter);

router.get('/', getReports);
router.post('/', createReport);
router.post('/preview', getReportData);
router.post('/:id/generate', generateReport);
router.delete('/:id', deleteReport);

export default router;
