import React, { useState } from 'react';
import { 
  Edit, 
  Trash2, 
  Bot, 
  MapPin, 
  Calendar, 
  CreditCard,
  Tag,
  MoreHorizontal,
  Receipt,
  Repeat
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Expense } from '@/types/expense';

interface ExpenseCardProps {
  expense: Expense;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  onCategorize: (id: string) => void;
}

export const ExpenseCard: React.FC<ExpenseCardProps> = ({ 
  expense, 
  onEdit, 
  onDelete, 
  onCategorize 
}) => {
  const [showActions, setShowActions] = useState(false);

  const handleEdit = () => {
    onEdit(expense);
    setShowActions(false);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      onDelete(expense.id);
    }
    setShowActions(false);
  };

  const handleCategorize = () => {
    onCategorize(expense.id);
    setShowActions(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const formatPaymentMethod = (method: string) => {
    return method.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };

  const getCategoryIcon = () => {
    return '📁';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: expense.category.color + '20' }}
          >
            <span className="text-xl">
              {getCategoryIcon()}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">
              {expense.description}
            </h3>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <span 
                className="px-2 py-1 rounded-full text-xs font-medium"
                style={{ 
                  backgroundColor: expense.category.color + '15',
                  color: expense.category.color 
                }}
              >
                {expense.category.name}
              </span>
              {expense.isRecurring && (
                <span className="flex items-center text-blue-600">
                  <Repeat className="h-3 w-3 mr-1" />
                  Recurring
                </span>
              )}
              {expense.aiConfidence && (
                <span className="flex items-center text-purple-600">
                  <Bot className="h-3 w-3 mr-1" />
                  AI: {(expense.aiConfidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Amount */}
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">
            ₦{expense.amount.toFixed(2)}
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowActions(!showActions)}
              className="p-1"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            
            {showActions && (
              <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                <button
                  onClick={handleEdit}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </button>
                <button
                  onClick={handleCategorize}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center"
                >
                  <Bot className="h-4 w-4 mr-2" />
                  Re-categorize
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="flex items-center text-gray-600">
          <Calendar className="h-4 w-4 mr-2 text-gray-400" />
          <span>{formatDate(expense.transactionDate)}</span>
        </div>
        
        {expense.merchant && (
          <div className="flex items-center text-gray-600">
            <MapPin className="h-4 w-4 mr-2 text-gray-400" />
            <span className="truncate">{expense.merchant}</span>
          </div>
        )}
        
        <div className="flex items-center text-gray-600">
          <CreditCard className="h-4 w-4 mr-2 text-gray-400" />
          <span>{formatPaymentMethod(expense.paymentMethod)}</span>
        </div>

        {expense.receiptUrl && (
          <div className="flex items-center text-gray-600">
            <Receipt className="h-4 w-4 mr-2 text-gray-400" />
            <a 
              href={expense.receiptUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700"
            >
              View Receipt
            </a>
          </div>
        )}
      </div>

      {/* Tags */}
      {expense.tags && expense.tags.length > 0 && (
        <div className="mt-4 flex items-center space-x-2">
          <Tag className="h-4 w-4 text-gray-400" />
          <div className="flex flex-wrap gap-1">
            {expense.tags.map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {expense.notes && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">{expense.notes}</p>
        </div>
      )}

      {/* Footer - Created/Updated info */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-400">
        <span>Created {formatDate(expense.createdAt)}</span>
        {expense.createdAt !== expense.updatedAt && (
          <span>Updated {formatDate(expense.updatedAt)}</span>
        )}
      </div>
    </div>
  );
};