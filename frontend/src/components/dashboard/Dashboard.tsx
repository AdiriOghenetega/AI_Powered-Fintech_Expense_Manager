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
  ArrowDownRight,
  Eye,
  Zap,
  DollarSign
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Skeleton Header */}
          <div className="mb-8 slide-in-from-left">
            <div className="h-8 w-64 bg-gray-200 rounded-lg mb-2 skeleton"></div>
            <div className="h-4 w-96 bg-gray-200 rounded skeleton"></div>
          </div>
          
          {/* Skeleton Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="stagger-item">
                <Card className="h-32">
                  <div className="skeleton w-full h-full rounded-xl"></div>
                </Card>
              </div>
            ))}
          </div>
          
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !overviewData?.data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 flex items-center justify-center">
        <div className="text-center scale-in">
          <div className="w-20 h-20 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load dashboard</h2>
          <p className="text-gray-600 mb-6">Please try refreshing the page</p>
          <Button onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  const { overview, categoryBreakdown, recentTransactions, budgetStatus } = overviewData.data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Animated Header */}
        <div className="slide-in-from-left">
          <div className="flex items-center space-x-3 mb-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600 mt-1">Welcome back! Here's your financial overview.</p>
            </div>
          </div>
        </div>

        {/* Enhanced Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="stagger-item">
            <SummaryCard
              title="This Month"
              amount={overview.currentMonth.total}
              change={overview.trends.totalChange}
              showIcon = {false}
              trend="spending"
            />
          </div>
          <div className="stagger-item">
            <SummaryCard
              title="Transactions"
              amount={overview.currentMonth.count}
              change={overview.trends.countChange}
              icon={<CreditCard className="h-6 w-6" />}
              color="green"
              isCount
            />
          </div>
          <div className="stagger-item">
            <SummaryCard
              title="Average Transaction"
              amount={overview.currentMonth.average}
              change={overview.trends.avgChange}
              icon={<Target className="h-6 w-6" />}
              color="purple"
            />
          </div>
          <div className="stagger-item">
            <SummaryCard
              title="Weekly Velocity"
              amount={overview.velocity?.recent7Days || 0}
              change={overview.trends.velocityChange}
              icon={<TrendingUp className="h-6 w-6" />}
              color="orange"
            />
          </div>
        </div>

        {/* Charts Row with Enhanced Animations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Category Breakdown */}
          <div className="slide-in-from-left">
            <Card className="card-elevated hover-lift">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-semibold text-gray-900">Spending by Category</h3>
                </div>
                <Link to="/expenses">
                  <Button variant="secondary" size="sm" className="hover-lift">
                    View All
                  </Button>
                </Link>
              </div>
              
              {categoryBreakdown.length > 0 ? (
                <div className="space-y-6">
                  <div className="h-64 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryBreakdown.slice(0, 6)}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="total"
                          nameKey="categoryName"
                          animationBegin={200}
                          animationDuration={800}
                        >
                          {categoryBreakdown.slice(0, 6).map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.categoryColor || COLORS[index]}
                              className="hover:opacity-80 transition-opacity duration-300"
                            />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => [`₦${value.toFixed(2)}`, 'Amount']}
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(10px)',
                            border: 'none',
                            borderRadius: '12px',
                            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div className="space-y-3">
                    {categoryBreakdown.slice(0, 5).map((category, index) => (
                      <div key={category.categoryId} className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl hover:bg-gray-50 transition-all duration-300 hover-lift">
                        <div className="flex items-center space-x-3">
                          <div 
                            className="w-4 h-4 rounded-full shadow-sm"
                            style={{ backgroundColor: category.categoryColor || COLORS[index] }}
                          />
                          <span className="text-sm font-medium text-gray-700">{category.categoryName}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">
                            ₦{category.total.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {((category.total / overview.currentMonth.total) * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Eye className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="font-medium">No expenses this month</p>
                    <p className="text-sm text-gray-400 mt-1">Start tracking your expenses</p>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Budget Status */}
          <div className="slide-in-from-right">
            <Card className="card-elevated hover-lift">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-semibold text-gray-900">Budget Status</h3>
                </div>
                <Link to="/budgets">
                  <Button variant="secondary" size="sm" className="hover-lift">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Budget
                  </Button>
                </Link>
              </div>
              
              {budgetStatus.length > 0 ? (
                <div className="space-y-5">
                  {budgetStatus.slice(0, 4).map((budget, index) => (
                    <div key={budget.id} className="space-y-3 p-4 bg-gray-50/50 rounded-xl hover:bg-gray-50 transition-all duration-300">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-800">
                          {budget.category.name}
                        </span>
                        <span className="text-sm text-gray-500 font-medium">
                          ₦{budget.spent.toFixed(2)} / ₦{budget.amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="relative w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-3 rounded-full transition-all duration-1000 ease-out ${
                            budget.percentage >= 100 ? 'bg-gradient-to-r from-red-500 to-red-600' :
                            budget.percentage >= 90 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                            budget.percentage >= 75 ? 'bg-gradient-to-r from-orange-500 to-amber-500' :
                            'bg-gradient-to-r from-green-500 to-emerald-500'
                          }`}
                          style={{ 
                            width: `${Math.min(budget.percentage, 100)}%`,
                            animationDelay: `${index * 100}ms`
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-semibold ${
                          budget.percentage >= 100 ? 'text-red-600' :
                          budget.percentage >= 90 ? 'text-yellow-600' :
                          'text-green-600'
                        }`}>
                          {budget.percentage.toFixed(1)}% used
                        </span>
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
                <div className="h-48 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Target className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="font-medium mb-2">No budgets set</p>
                    <Link to="/budgets">
                      <Button variant="secondary" size="sm" className="hover-lift">
                        Create your first budget
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="slide-in-from-bottom">
          <Card className="card-elevated">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
              </div>
              <Link to="/expenses">
                <Button variant="secondary" size="sm" className="hover-lift">
                  View All
                </Button>
              </Link>
            </div>
            
            {recentTransactions.length > 0 ? (
              <div className="space-y-3">
                {recentTransactions.slice(0, 8).map((transaction, index) => (
                  <div 
                    key={transaction.id} 
                    className="flex items-center justify-between p-4 bg-gray-50/50 rounded-xl hover:bg-gray-50 transition-all duration-300 hover-lift"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center space-x-4">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
                        style={{ backgroundColor: transaction.category.color + '20' }}
                      >
                        <span 
                          className="text-lg"
                          style={{ color: transaction.category.color }}
                        >
                          {getCategoryIcon(transaction.category.icon)}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{transaction.description}</div>
                        <div className="text-sm text-gray-500">
                          {transaction.merchant && (
                            <span>{transaction.merchant} • </span>
                          )}
                          {formatDate(transaction.transactionDate)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900 text-lg">
                        ₦{transaction.amount.toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-500">{transaction.category.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <CreditCard className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="font-medium mb-2">No recent transactions</p>
                  <p className="text-sm text-gray-400 mb-4">Add your first expense to get started</p>
                  <Button variant="secondary" size="sm" className="hover-lift">
                    Add your first expense
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

// Enhanced Summary Card Component
interface SummaryCardProps {
  title: string;
  amount: number;
  change?: number;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'purple' | 'orange';
  isCount?: boolean;
  trend?: 'spending' | 'income' | 'neutral';
  showIcon?: boolean;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ 
  title, 
  amount, 
  change, 
  icon, 
  color, 
  isCount = false,
  trend = 'neutral',
  showIcon = true
}) => {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-emerald-600',
    purple: 'from-purple-500 to-violet-600',
    orange: 'from-orange-500 to-amber-600',
  };

  const getChangeColor = () => {
    if (change === undefined) return 'text-gray-500';
    if (trend === 'spending') {
      return change >= 0 ? 'text-red-600' : 'text-green-600';
    }
    return change >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const ChangeIcon = change === undefined ? null : 
    (trend === 'spending' ? 
      (change >= 0 ? ArrowUpRight : ArrowDownRight) :
      (change >= 0 ? ArrowUpRight : ArrowDownRight)
    );

  return (
    <Card className="hover-lift relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br opacity-5 rounded-full -mr-16 -mt-16" 
           style={{ background: `linear-gradient(135deg, var(--tw-gradient-stops))` }} />
      
      <div className="relative flex items-center space-x-4">
        {showIcon && <div className={`p-3 rounded-xl bg-gradient-to-br ${colorClasses[color]} shadow-lg`}>
          <div className="text-white">
            {icon}
          </div>
        </div>}
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {isCount ? amount.toLocaleString() : `₦${amount.toFixed(2)}`}
          </p>
          {change !== undefined && (
            <div className={`flex items-center text-sm mt-2 ${getChangeColor()}`}>
              {ChangeIcon && <ChangeIcon className="h-4 w-4 mr-1" />}
              <span className="font-semibold">
                {change >= 0 ? '+' : ''}{Math.abs(change).toFixed(1)}% vs last month
              </span>
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