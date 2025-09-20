import React from 'react';
import { 
  Edit3, 
  Trash2, 
  Calendar, 
  Building, 
  CreditCard,
  Hash,
  Sparkles,
  MoreHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { Expense } from '@/types/expense';

interface ExpenseCardProps {
  expense: Expense;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  onCategorize?: (id: string) => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getPaymentMethodIcon = (method: string) => {
  const icons: Record<string, string> = {
    CREDIT_CARD: 'í²³',
    DEBIT_CARD: 'í²³',
    CASH: 'í²µ',
    BANK_TRANSFER: 'í¿¦',
    DIGITAL_WALLET: 'í³±',
  };
  return icons[method] || 'í²³';
};

export const ExpenseCard: React.FC<ExpenseCardProps> = ({ 
  expense, 
  onEdit, 
  onDelete, 
  onCategorize 
}) => {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Amount and Category */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {formatCurrency(expense.amount)}
              </h3>
              <div className="flex items-center mt-1">
                <div 
                  className="w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: expense.category.color }}
                />
                <span className="text-sm text-gray-600">
                  {expense.category.name}
                </span>
                {expense.aiConfidence && (
                  <div className="flex items-center ml-2">
                    <Sparkles className="h-3 w-3 text-yellow-500 mr-1" />
                    <span className="text-xs text-gray-500">
                      {Math.round(expense.aiConfidence * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-gray-900 font-medium mb-2">
            {expense.description}
          </p>

          {/* Details */}
          <div className="space-y-2">
            <div className="flex items-center text-sm text-gray-500">
              <Calendar className="h-4 w-4 mr-2" />
              {formatDate(expense.transactionDate)}
            </div>

            {expense.merchant && (
              <div className="flex items-center text-sm text-gray-500">
                <Building className="h-4 w-4 mr-2" />
                {expense.merchant}
              </div>
            )}

            <div className="flex items-center text-sm text-gray-500">
              <CreditCard className="h-4 w-4 mr-2" />
              {getPaymentMethodIcon(expense.paymentMethod)}{' '}
              {expense.paymentMethod.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
            </div>
          </div>

          {/* Tags */}
          {expense.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {expense.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
                >
                  <Hash className="h-2 w-2 mr-1" />
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Recurring indicator */}
          {expense.isRecurring && (
            <div className="mt-2">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                í´„ Recurring
              </span>
            </div>
          )}

          {/* Notes */}
          {expense.notes && (
            <p className="text-sm text-gray-600 mt-3 bg-gray-50 p-2 rounded">
              {expense.notes}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-1 ml-4">
          {onCategorize && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCategorize(expense.id)}
              title="Re-categorize with AI"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(expense)}
            title="Edit expense"
          >
            <Edit3 className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(expense.id)}
            title="Delete expense"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
