import React, { useState } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  CreditCard, 
  PieChart,
  Calendar,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

// Simple StatCard component for now
const StatCard: React.FC<{
  title: string;
  value: string;
  change?: number;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, change, icon, color }) => (
  <Card>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {change !== undefined && (
          <div className="flex items-center mt-2">
            <span className={`text-sm font-medium ${
              change >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {change >= 0 ? '+' : ''}{change.toFixed(1)}%
            </span>
            <span className="text-sm text-gray-500 ml-1">vs last month</span>
          </div>
        )}
      </div>
      <div className={`p-3 rounded-full ${color}`}>
        {icon}
      </div>
    </div>
  </Card>
);

export const Dashboard: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('month');

  // Mock data for now
  const mockStats = {
    totalSpending: 2847.50,
    transactions: 45,
    avgTransaction: 63.28,
    categories: 8,
    trends: {
      spending: 12.5,
      transactions: 8.2,
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3">
            <Calendar className="h-6 w-6 text-gray-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600">
                {new Date().toLocaleDateString('en-US', { 
                  weekday: 'long',
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 mt-4 sm:mt-0">
            <div className="flex rounded-md shadow-sm">
              {['week', 'month', 'quarter', 'year'].map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period as any)}
                  className={`px-3 py-2 text-sm font-medium border first:rounded-l-md last:rounded-r-md first:border-r-0 last:border-l-0 ${
                    selectedPeriod === period
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
            
            <Button variant="secondary" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Spending"
            value={formatCurrency(mockStats.totalSpending)}
            change={mockStats.trends.spending}
            icon={<DollarSign className="h-6 w-6 text-white" />}
            color="bg-blue-500"
          />
          <StatCard
            title="Transactions"
            value={mockStats.transactions.toString()}
            change={mockStats.trends.transactions}
            icon={<CreditCard className="h-6 w-6 text-white" />}
            color="bg-green-500"
          />
          <StatCard
            title="Average Transaction"
            value={formatCurrency(mockStats.avgTransaction)}
            icon={<TrendingUp className="h-6 w-6 text-white" />}
            color="bg-purple-500"
          />
          <StatCard
            title="Categories Active"
            value={mockStats.categories.toString()}
            icon={<PieChart className="h-6 w-6 text-white" />}
            color="bg-orange-500"
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Charts placeholder */}
          <div className="lg:col-span-2">
            <Card>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending Overview</h3>
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-4xl mb-2">í³Š</div>
                  <p className="text-gray-500">Charts will appear here</p>
                  <p className="text-sm text-gray-400">Connect to analytics API for live data</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Recent Activity */}
          <div>
            <Card>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {[
                  { name: 'Grocery Store', amount: 45.67, date: '2 hours ago', category: 'Food' },
                  { name: 'Gas Station', amount: 32.10, date: '1 day ago', category: 'Transport' },
                  { name: 'Coffee Shop', amount: 8.50, date: '2 days ago', category: 'Food' },
                ].map((transaction, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{transaction.name}</p>
                      <p className="text-xs text-gray-500">{transaction.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(transaction.amount)}
                      </p>
                      <p className="text-xs text-gray-500">{transaction.category}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4">
                <Button variant="secondary" size="sm" className="w-full">
                  View All Transactions
                </Button>
              </div>
            </Card>
          </div>
        </div>

        {/* Quick Actions */}
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
              <p className="text-sm text-gray-600">Common tasks and shortcuts</p>
            </div>
            <div className="flex space-x-3">
              <Button variant="secondary" size="sm">
                í³Š View Reports
              </Button>
              <Button size="sm">
                <DollarSign className="h-4 w-4 mr-2" />
                Add Expense
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
