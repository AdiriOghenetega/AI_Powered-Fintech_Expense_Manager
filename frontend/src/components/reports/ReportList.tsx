import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  Trash2, 
  Copy, 
  Calendar,
  Clock,
  Filter,
  Plus,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useReports, useDeleteReport, useDownloadReport, useGenerateReport } from '@/hooks/useReports';
import type { Report } from '@/types/report';
import type { ReportFilters } from '@/services/reportService';

interface ReportListProps {
  onGenerateNew: () => void;
}

const formatFileSize = (bytes?: number) => {
  if (!bytes) return 'Unknown size';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getStatusColor = (status: Report['status']) => {
  switch (status) {
    case 'completed': return 'text-green-600 bg-green-100';
    case 'generating': return 'text-blue-600 bg-blue-100';
    case 'pending': return 'text-yellow-600 bg-yellow-100';
    case 'failed': return 'text-red-600 bg-red-100';
    default: return 'text-gray-600 bg-gray-100';
  }
};

const getTypeIcon = (type: Report['type']) => {
  switch (type) {
    case 'monthly': return '📅';
    case 'quarterly': return '📊';
    case 'yearly': return '🗓️';
    case 'custom': return '⚙️';
    default: return '📄';
  }
};

export const ReportList: React.FC<ReportListProps> = ({ onGenerateNew }) => {
  const [filters, setFilters] = useState<ReportFilters>({
    page: 1,
    limit: 10,
  });

  const { data: reportsData, isLoading, error } = useReports(filters);
  const deleteReport = useDeleteReport();
  const downloadReport = useDownloadReport();
  const generateReport = useGenerateReport();

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this report?')) {
      try {
        await deleteReport.mutateAsync(id);
      } catch (error) {
        console.error('Failed to delete report:', error);
      }
    }
  };

  const handleDownload = async (id: string, format: 'pdf' | 'csv' | 'excel' = 'pdf') => {
    try {
      await downloadReport.mutateAsync({ id, format });
    } catch (error) {
      console.error('Failed to download report:', error);
    }
  };

  const handleRegenerate = async (id: string) => {
    try {
      await generateReport.mutateAsync(id);
    } catch (error) {
      console.error('Failed to regenerate report:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900">Error loading reports</h3>
        <p className="text-gray-500 mt-2">Please try refreshing the page</p>
      </div>
    );
  }

  const reports = reportsData?.data?.reports || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Reports</h2>
          <p className="text-gray-600 mt-1">Generate and manage your financial reports</p>
        </div>
        <Button onClick={onGenerateNew}>
          <Plus className="h-4 w-4 mr-2" />
          Generate New Report
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <Filter className="h-4 w-4 text-gray-400 mr-2" />
              <select
                value={filters.type || ''}
                onChange={(e) => setFilters({ ...filters, type: e.target.value as any || undefined })}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm"
              >
                <option value="">All Types</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            
            <select
              value={filters.status || ''}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as any || undefined })}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm"
            >
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="generating">Generating</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="text-sm text-gray-500">
            {reportsData?.data?.pagination?.totalCount || 0} reports
          </div>
        </div>
      </Card>

      {/* Reports List */}
      {reports.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No reports yet</h3>
            <p className="text-gray-500 mb-6">
              Generate your first financial report to get started with analytics.
            </p>
            <Button onClick={onGenerateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Generate Your First Report
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <Card key={report.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">{getTypeIcon(report.type)}</div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-medium text-gray-900">{report.name}</h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(report.status)}`}>
                        {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                      </span>
                      {report.isScheduled && (
                        <span className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded-full">
                          <Clock className="h-3 w-3 inline mr-1" />
                          Scheduled
                        </span>
                      )}
                    </div>
                    
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="h-4 w-4 mr-1" />
                        {formatDate(report.parameters.startDate)} - {formatDate(report.parameters.endDate)}
                      </div>
                      
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>Generated: {formatDate(report.generatedAt)}</span>
                        {report.fileSize && <span>Size: {formatFileSize(report.fileSize)}</span>}
                        {report.downloadCount && <span>Downloads: {report.downloadCount}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2">
                  {report.status === 'completed' && (
                    <>
                      <div className="relative group">
                        <Button variant="secondary" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                        <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                          <button
                            onClick={() => handleDownload(report.id, 'pdf')}
                            className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 first:rounded-t-lg"
                          >
                            PDF
                          </button>
                          <button
                            onClick={() => handleDownload(report.id, 'csv')}
                            className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50"
                          >
                            CSV
                          </button>
                          <button
                            onClick={() => handleDownload(report.id, 'excel')}
                            className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 last:rounded-b-lg"
                          >
                            Excel
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRegenerate(report.id)}
                    loading={generateReport.isPending}
                    disabled={report.status === 'generating'}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDelete(report.id)}
                    loading={deleteReport.isPending}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                                      </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {reportsData?.data?.pagination && reportsData.data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}
            disabled={!reportsData.data.pagination.hasPrevPage}
          >
            Previous
          </Button>
          
          <span className="text-sm text-gray-600">
            Page {reportsData.data.pagination.currentPage} of {reportsData.data.pagination.totalPages}
          </span>
          
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}
            disabled={!reportsData.data.pagination.hasNextPage}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};