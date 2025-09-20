import React from 'react';
import { Search, Calendar, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCategories } from '@/hooks/useExpenses';
import type { ExpenseFilters } from '@/services/expenseService';

interface ExpenseFiltersProps {
  filters: ExpenseFilters;
  onFiltersChange: (filters: ExpenseFilters) => void;
  onClearFilters: () => void;
}

const paymentMethods = [
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'DEBIT_CARD', label: 'Debit Card' },
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'DIGITAL_WALLET', label: 'Digital Wallet' },
];

export const ExpenseFilters: React.FC<ExpenseFiltersProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
}) => {
  const { data: categoriesData } = useCategories();

  const updateFilter = (key: keyof ExpenseFilters, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value === '' ? undefined : value,
      page: 1, // Reset to first page when filtering
    });
  };

  const hasActiveFilters = Object.values(filters).some(
    (value, index) => {
      const keys = Object.keys(filters);
      // Ignore page and limit for "active filters" check
      if (keys[index] === 'page' || keys[index] === 'limit') return false;
      return value !== undefined && value !== '';
    }
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Filter className="h-5 w-5 text-gray-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-900">Filters</h3>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div className="lg:col-span-2">
          <Input
            placeholder="Search descriptions, merchants..."
            value={filters.search || ''}
            onChange={(e) => updateFilter('search', e.target.value)}
            icon={<Search />}
          />
        </div>

        {/* Date Range */}
        <div>
          <Input
            type="date"
            label="Start Date"
            value={filters.startDate || ''}
            onChange={(e) => updateFilter('startDate', e.target.value)}
            icon={<Calendar />}
          />
        </div>

        <div>
          <Input
            type="date"
            label="End Date"
            value={filters.endDate || ''}
            onChange={(e) => updateFilter('endDate', e.target.value)}
            icon={<Calendar />}
          />
        </div>

        {/* Category Filter */}
        <div>
          <label className="form-label">Category</label>
          <select
            value={filters.category || ''}
            onChange={(e) => updateFilter('category', e.target.value)}
            className="form-input"
          >
            <option value="">All Categories</option>
            {categoriesData?.data?.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {/* Payment Method Filter */}
        <div>
          <label className="form-label">Payment Method</label>
          <select
            value={filters.paymentMethod || ''}
            onChange={(e) => updateFilter('paymentMethod', e.target.value)}
            className="form-input"
          >
            <option value="">All Methods</option>
            {paymentMethods.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </div>

        {/* Amount Range */}
        <div>
          <Input
            type="number"
            step="0.01"
            label="Min Amount"
            placeholder="0.00"
            value={filters.minAmount || ''}
            onChange={(e) => updateFilter('minAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
          />
        </div>

        <div>
          <Input
            type="number"
            step="0.01"
            label="Max Amount"
            placeholder="1000.00"
            value={filters.maxAmount || ''}
            onChange={(e) => updateFilter('maxAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
          />
        </div>

        {/* Sort Options */}
        <div>
          <label className="form-label">Sort By</label>
          <select
            value={filters.sortBy || 'date'}
            onChange={(e) => updateFilter('sortBy', e.target.value)}
            className="form-input"
          >
            <option value="date">Date</option>
            <option value="amount">Amount</option>
            <option value="merchant">Merchant</option>
            <option value="category">Category</option>
          </select>
        </div>

        <div>
          <label className="form-label">Sort Order</label>
          <select
            value={filters.sortOrder || 'desc'}
            onChange={(e) => updateFilter('sortOrder', e.target.value)}
            className="form-input"
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
        </div>
      </div>
    </div>
  );
};
