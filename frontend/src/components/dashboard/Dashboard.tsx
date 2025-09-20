import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  TrendingUp,
  CreditCard, 
  Target,
  AlertTriangle,
  Plus,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { analyticsService } from '@/services/analyticsService';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

export const Dashboard: React.FC = () => {
  const { data: overviewData, isLoading, error } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => analyticsService.getOverview(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !overviewData?.data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Failed to load dashboard</h2>
          <p className="text-gray-600 mt-2">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  const { overview, categoryBreakdown, recentTransactions, budgetStatus } = overviewData.data;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back! Here's your financial overview.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <SummaryCard
            title="This Month"
            amount={overview.currentMonth.total}
            change={overview.trends.totalChange}
            icon={<p className="text-3xl font-semibold">₦</p>}
            color="blue"
          />
          <SummaryCard
            title="Transactions"
            amount={overview.currentMonth.count}
            change={overview.trends.countChange}
            icon={<CreditCard className="h-6 w-6" />}
            color="green"
            isCount
          />
          <SummaryCard
            title="Average Transaction"
            amount={overview.currentMonth.average}
            change={overview.trends.avgChange}
            icon={<Target className="h-6 w-6" />}
            color="purple"
          />
          <SummaryCard
            title="Weekly Velocity"
            amount={overview.velocity?.recent7Days || 0}
            change={overview.trends.velocityChange}
            icon={<TrendingUp className="h-6 w-6" />}
            color="orange"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Category Breakdown */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Spending by Category</h3>
              <Link to="/expenses">
              <Button variant="ghost" size="sm">
                View All
              </Button>
              </Link>
            </div>
            
            {categoryBreakdown.length > 0 ? (
              <>
                <div className="h-64 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryBreakdown.slice(0, 6)}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="total"
                        nameKey="categoryName"
                      >
                        {categoryBreakdown.slice(0, 6).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.categoryColor || COLORS[index]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`₦${value.toFixed(2)}`, 'Amount']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="space-y-2">
                  {categoryBreakdown.slice(0, 5).map((category, index) => (
                    <div key={category.categoryId} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div 
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: category.categoryColor || COLORS[index] }}
                        />
                        <span className="text-sm text-gray-600">{category.categoryName}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">
                          ₦{category.total.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {((category.total / overview.currentMonth.total) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <p>No expenses this month</p>
                </div>
              </div>
            )}
          </Card>

          {/* Budget Status */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Budget Status</h3>
              <Link to="/budgets">
              <Button variant="ghost" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Budget
              </Button>
              </Link>
            </div>
            
            {budgetStatus.length > 0 ? (
              <div className="space-y-4">
                {budgetStatus.slice(0, 4).map((budget) => (
                  <div key={budget.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        {budget.category.name}
                      </span>
                      <span className="text-sm text-gray-500">
                        ₦{budget.spent.toFixed(2)} / ₦{budget.amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          budget.percentage >= 100 ? 'bg-red-500' :
                          budget.percentage >= 90 ? 'bg-yellow-500' :
                          budget.percentage >= 75 ? 'bg-orange-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{budget.percentage.toFixed(1)}% used</span>
                      <span className={`font-medium ${
                        budget.percentage >= 100 ? 'text-red-600' :
                        budget.percentage >= 90 ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        ₦{budget.remaining.toFixed(2)} remaining
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Target className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No budgets set</p>
                  <Button variant="ghost" size="sm" className="mt-2">
                    Create your first budget
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Recent Transactions */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
            <Link to="/expenses">
            <Button variant="ghost" size="sm">
              View All
            </Button>
            </Link>
          </div>
          
          {recentTransactions.length > 0 ? (
            <div className="space-y-3">
              {recentTransactions.slice(0, 8).map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center mr-3"
                      style={{ backgroundColor: transaction.category.color + '20' }}
                    >
                      <span style={{ color: transaction.category.color }}>
                        {getCategoryIcon(transaction.category.icon)}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{transaction.description}</div>
                      <div className="text-sm text-gray-500">
                        {transaction.merchant} • {formatDate(transaction.transactionDate)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">
                      ₦{transaction.amount.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-500">{transaction.category.name}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <CreditCard className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>No recent transactions</p>
                <Button variant="ghost" size="sm" className="mt-2">
                  Add your first expense
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

// Summary Card Component
interface SummaryCardProps {
  title: string;
  amount: number;
  change?: number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'orange';
  isCount?: boolean;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ 
  title, 
  amount, 
  change, 
  icon, 
  color, 
  isCount = false 
}) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  const changeColor = change === undefined ? 'text-gray-500' : change >= 0 ? 'text-green-600' : 'text-red-600';
  const ChangeIcon = change === undefined ? null : change >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Card>
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${colorClasses[color]} mr-4`}>
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">
            {isCount ? amount.toLocaleString() : `₦${amount.toFixed(2)}`}
          </p>
          {change !== undefined && (
            <div className={`flex items-center text-sm ${changeColor}`}>
              {ChangeIcon && <ChangeIcon className="h-4 w-4 mr-1" />}
              <span>{Math.abs(change).toFixed(1)}% vs last month</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

// Utility functions
function getCategoryIcon(iconName: string): string {
  const iconMap: Record<string, string> = {
    utensils: '🍽️',
    car: '🚗',
    'shopping-bag': '🛍️',
    film: '🎬',
    receipt: '📄',
    heart: '❤️',
    plane: '✈️',
    book: '📚',
    user: '👤',
    home: '🏠',
    briefcase: '💼',
    'more-horizontal': '⋯',
  };
  return iconMap[iconName] || '📁';
}

function formatDate(dateString: string): string {
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
}