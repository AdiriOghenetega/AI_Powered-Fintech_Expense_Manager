import { apiRequest } from './api';
import type { User, LoginCredentials, RegisterData } from '@/types/auth';

export const authService = {
  async login(credentials: LoginCredentials) {
    const response = await apiRequest<{ user: User; token: string }>('POST', '/auth/login', credentials);
    
    if (response.success && response.data) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    
    return response;
  },

  async register(userData: RegisterData) {
    const response = await apiRequest<{ user: User; token: string }>('POST', '/auth/register', userData);
    
    if (response.success && response.data) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    
    return response;
  },

  async getCurrentUser() {
    return await apiRequest<{ user: User }>('GET', '/auth/me');
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getStoredUser(): User | null {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  },

  getStoredToken(): string | null {
    return localStorage.getItem('token');
  },

  isAuthenticated(): boolean {
    return !!this.getStoredToken();
  },
};
