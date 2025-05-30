'use client';

import { useState } from 'react';

interface AuthModalProps {
  showAuthModal: boolean;
  isRegisterMode: boolean;
  authLoading: boolean;
  authError: string;
  onAuth: (email: string, password: string) => void;
  onToggleMode: () => void;
  onClose: () => void;
}

export default function AuthModal({
  showAuthModal,
  isRegisterMode,
  authLoading,
  authError,
  onAuth,
  onToggleMode,
  onClose
}: AuthModalProps) {
  if (!showAuthModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg w-96">
        <h2 className="text-2xl font-bold mb-6 text-center">
          {isRegisterMode ? 'Register' : 'Login'}
        </h2>
        <AuthForm 
          onSubmit={onAuth}
          loading={authLoading}
          isRegisterMode={isRegisterMode}
          error={authError}
        />
        <div className="mt-4 text-center">
          <button
            onClick={onToggleMode}
            className="text-blue-600 hover:text-blue-800"
          >
            {isRegisterMode 
              ? 'Already have an account? Login' 
              : "Don't have an account? Register"}
          </button>
        </div>
        <div className="mt-4 text-center">
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// auth form component
function AuthForm({ 
  onSubmit, 
  loading, 
  isRegisterMode,
  error
}: { 
  onSubmit: (email: string, password: string) => void;
  loading: boolean;
  isRegisterMode: boolean;
  error: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      alert('Please fill in all fields');
      return;
    }
    onSubmit(email, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="text-red-600 text-sm text-center mb-4">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter your email"
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter your password"
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {loading ? (isRegisterMode ? 'Registering...' : 'Logging in...') : (isRegisterMode ? 'Register' : 'Login')}
      </button>
    </form>
  );
} 
