import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Save, 
  X, 
  DollarSign, 
  Calendar, 
  Tag, 
  CreditCard,
  Sparkles,
  Building,
  FileText,
  Hash
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { useCategories, useCreateExpense, useUpdateExpense, useCategorizeExpense } from '@/hooks/useExpenses';
import type { Expense, CreateExpenseData } from '@/types/expense';

const expenseSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
  transactionDate: z.string().min(1, 'Date is required'),
  merchant: z.string().max(100, 'Merchant name too long').optional(),
  paymentMethod: z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'BANK_TRANSFER', 'DIGITAL_WALLET']),
  categoryId: z.string().optional(),
  isRecurring: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  notes: z.string().max(1000, 'Notes too long').optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

interface ExpenseFormProps {
  expense?: Expense;
  onClose: () => void;
  onSuccess?: () => void;
}

const paymentMethods = [
  { value: 'CREDIT_CARD', label: 'Credit Card', icon: 'í²³' },
  { value: 'DEBIT_CARD', label: 'Debit Card', icon: 'í²³' },
  { value: 'CASH', label: 'Cash', icon: 'í²µ' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer', icon: 'í¿¦' },
  { value: 'DIGITAL_WALLET', label: 'Digital Wallet', icon: 'í³±' },
];

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ expense, onClose, onSuccess }) => {
  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState('');
  
  const { data: categoriesData } = useCategories();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const categorizeExpense = useCategorizeExpense();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: expense ? {
      amount: expense.amount,
      description: expense.description,
      transactionDate: expense.transactionDate.split('T')[0],
      merchant: expense.merchant || '',
      paymentMethod: expense.paymentMethod,
      categoryId: expense.category.id,
      isRecurring: expense.isRecurring,
      tags: expense.tags,
      notes: expense.notes || '',
    } : {
      amount: 0,
      description: '',
      transactionDate: new Date().toISOString().split('T')[0],
      merchant: '',
      paymentMethod: 'CREDIT_CARD',
      categoryId: '',
      isRecurring: false,
      tags: [],
      notes: '',
    },
  });

  const watchedFields = watch(['description', 'merchant', 'tags']);

  const handleAICategory = async () => {
    const description = watchedFields[0];
    const merchant = watchedFields[1];

    if (!description) return;

    try {
      // Mock AI categorization for now
      const categories = categoriesData?.data?.categories || [];
      if (categories.length > 0) {
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        setValue('categoryId', randomCategory.id);
      }
    } catch (err) {
      console.error('AI categorization failed:', err);
    }
  };

  const addTag = () => {
    if (newTag.trim() && !watchedFields[2].includes(newTag.trim())) {
      setValue('tags', [...watchedFields[2], newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setValue('tags', watchedFields[2].filter(tag => tag !== tagToRemove));
  };

  const onSubmit = async (data: ExpenseFormData) => {
    setError('');

    try {
      if (expense) {
        await updateExpense.mutateAsync({ id: expense.id, data });
      } else {
        await createExpense.mutateAsync(data);
      }
      
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save expense');
    }
  };

  const isLoading = createExpense.isPending || updateExpense.isPending;
  const isAILoading = categorizeExpense.isPending;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {expense ? 'Edit Expense' : 'Add New Expense'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Amount and Date Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              {...register('amount', { valueAsNumber: true })}
              type="number"
              step="0.01"
              label="Amount *"
              icon={<DollarSign />}
              error={errors.amount?.message}
              placeholder="0.00"
            />

            <Input
              {...register('transactionDate')}
              type="date"
              label="Transaction Date *"
              icon={<Calendar />}
              error={errors.transactionDate?.message}
            />
          </div>

          {/* Description */}
          <Input
            {...register('description')}
            label="Description *"
            icon={<FileText />}
            error={errors.description?.message}
            placeholder="What did you spend on?"
          />

          {/* Merchant and Payment Method */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              {...register('merchant')}
              label="Merchant"
              icon={<Building />}
              placeholder="Store or service name"
            />

            <div>
              <label className="form-label">Payment Method *</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <select
                  {...register('paymentMethod')}
                  className="form-input pl-10"
                >
                  {paymentMethods.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.icon} {method.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Category with AI suggestion */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="form-label">Category</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAICategory}
                loading={isAILoading}
                disabled={!watchedFields[0]}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                AI Suggest
              </Button>
            </div>
            <div className="relative">
              <Tag className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <select
                {...register('categoryId')}
                className="form-input pl-10"
              >
                <option value="">Select a category</option>
                {categoriesData?.data?.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="form-label">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {watchedFields[2].map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                >
                  <Hash className="h-3 w-3 mr-1" />
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-2 text-blue-600 hover:text-blue-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                className="form-input flex-1"
                placeholder="Add tag..."
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addTag}
                disabled={!newTag.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Recurring checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              {...register('isRecurring')}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label className="ml-2 text-sm text-gray-700">
              This is a recurring expense
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">Notes</label>
            <textarea
              {...register('notes')}
              rows={3}
              className="form-input"
              placeholder="Additional notes (optional)"
            />
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isLoading}
              className="flex-1"
            >
              <Save className="h-4 w-4 mr-2" />
              {expense ? 'Update' : 'Save'} Expense
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
