import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  categorizeExpense,
  getCategories,
} from '../controllers/expenseController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests' },
});

// All routes require authentication
router.use(authenticateToken);
router.use(generalLimiter);

// Expense routes
router.get('/', getExpenses);
router.post('/', createExpense);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);
router.post('/:id/categorize', categorizeExpense);

// Category routes
router.get('/categories/list', getCategories);

export default router;
