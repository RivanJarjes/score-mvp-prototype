'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { editor } from 'monaco-editor';
import AuthModal from './components/AuthModal';
import Header from './components/Header';
import LoadingSpinner from './components/LoadingSpinner';
import MainInterface from './components/MainInterface';
import SessionSidebar, { SessionSidebarRef } from './components/SessionSidebar';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  problem?: string;
  code?: string;
  syntax_errors?: string;
}

export default function Home() {
  const [problem, setProblem] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const sessionSidebarRef = useRef<SessionSidebarRef>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // check authentication status on page load
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // handle session parameter from URL
  useEffect(() => {
    if (isLoggedIn) {
      const sessionFromUrl = searchParams.get('session');
      if (sessionFromUrl && sessionFromUrl !== currentSessionId) {
        setCurrentSessionId(sessionFromUrl);
        fetchSessionHistory(sessionFromUrl);
      } else if (!sessionFromUrl && currentSessionId) {
        // clear session if no session in URL
        setCurrentSessionId(null);
        setMessages([]);
        setSessionTitle(null);
      }
    }
  }, [searchParams, isLoggedIn]);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('http://localhost:8000/me', {
        method: 'GET',
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        setIsLoggedIn(true);
        setUserEmail(data.email);
      } else {
        setIsLoggedIn(false);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setIsLoggedIn(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  const fetchSessionHistory = async (sessionId: string) => {
    try {
      const res = await fetch(`http://localhost:8000/sessions/${sessionId}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setSessionTitle(data.title);
      } else {
        console.error('Failed to fetch session history');
        // If session not found, clear URL parameter
        router.replace('/');
      }
    } catch (error) {
      console.error('Error fetching session history:', error);
    }
  };

  const handleSessionSelect = (sessionId: string) => {
    router.push(`/?session=${sessionId}`);
  };

  const startNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setSessionTitle(null);
    setProblem('');
    editorRef.current?.setValue('');
    router.replace('/');
  };

  const handleShowLogin = () => {
    setIsRegisterMode(false);
    setAuthError('');
    setShowAuthModal(true);
  };

  const handleShowRegister = () => {
    setIsRegisterMode(true);
    setAuthError('');
    setShowAuthModal(true);
  };

  const handleToggleAuthMode = () => {
    setIsRegisterMode(!isRegisterMode);
    setAuthError('');
  };

  const handleAuth = async (email: string, password: string) => {
    setAuthLoading(true);
    
    try {
      const endpoint = isRegisterMode ? '/auth/register' : '/auth/login';
      const body = isRegisterMode 
        ? { email, password, student: true }
        : { email, password };
      
      const res = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setIsLoggedIn(true);
        setUserEmail(email);
        setShowAuthModal(false);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setAuthError(errorData.detail || `${isRegisterMode ? 'Registration' : 'Login'} failed`);
      }
    } catch (error) {
      console.error('Auth error:', error);
      setAuthError('Error connecting to the server');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('http://localhost:8000/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    setIsLoggedIn(false);
    setUserEmail('');
    setProblem('');
    setMessages([]);
    setCurrentSessionId(null);
    setSessionTitle(null);
    router.replace('/');
  };

  const handleSubmit = async () => {
    const code = editorRef.current?.getValue() || '';
    
    if (!problem.trim()) {
      alert('Please enter a problem description');
      return;
    }

    setLoading(true);

    // add user message to the UI immediately
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: `Code:\n${code}\n\nProblem:\n${problem}`,
      created_at: new Date().toISOString(),
      problem,
      code
    };
    
    setMessages(prev => [...prev, userMessage]);

    try {
      const res = await fetch('http://localhost:8000/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          problem: problem,
          code: code || null,
          session_id: currentSessionId
        }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          setMessages(prev => [...prev, {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: 'Error: You must be logged in to access this service',
            created_at: new Date().toISOString()
          }]);
          setIsLoggedIn(false);
          setLoading(false);
          return;
        }
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      
      // update url with session ID if this is a new session
      if (!currentSessionId && data.session_id) {
        setCurrentSessionId(data.session_id);
        router.replace(`/?session=${data.session_id}`);
        // refresh the sidebar to show the new session
        sessionSidebarRef.current?.refreshSessions();
        
        // get the session title for the newly created session
        try {
          const sessionRes = await fetch(`http://localhost:8000/sessions/${data.session_id}`, {
            method: 'GET',
            credentials: 'include',
          });
          
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            setSessionTitle(sessionData.title);
          }
        } catch (error) {
          console.error('Error fetching session title:', error);
        }
      }

      // add assistant message
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        created_at: new Date().toISOString()
      };

      setMessages(prev => prev.map(msg => 
        msg.id === userMessage.id ? { ...msg, id: `user-${Date.now()}` } : msg
      ).concat([assistantMessage]));

      // clear input after successful submission
      setProblem('');
      
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Error connecting to the backend. Make sure the server is running on localhost:8000',
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // show loading spinner while checking authentication
  if (checkingAuth) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen">
      <Header
        isLoggedIn={isLoggedIn}
        userEmail={userEmail}
        onLogin={handleShowLogin}
        onRegister={handleShowRegister}
        onLogout={handleLogout}
      />

      <AuthModal
        showAuthModal={showAuthModal}
        isRegisterMode={isRegisterMode}
        authLoading={authLoading}
        authError={authError}
        onAuth={handleAuth}
        onToggleMode={handleToggleAuthMode}
        onClose={() => setShowAuthModal(false)}
      />

      {/* main content - only show when logged in */}
      {isLoggedIn ? (
        <div className="flex h-screen">
          {/* session sidebar */}
          <SessionSidebar
            currentSessionId={currentSessionId}
            onSessionSelect={handleSessionSelect}
            onNewSession={startNewSession}
            ref={sessionSidebarRef}
          />
          
          {/* main interface */}
          <div className="flex-1">
            <MainInterface
              problem={problem}
              messages={messages}
              loading={loading}
              sessionTitle={sessionTitle}
              onProblemChange={setProblem}
              onSubmit={handleSubmit}
              onNewSession={startNewSession}
              editorRef={editorRef}
            />
          </div>
        </div>
      ) : (
        /* show only when logged out */
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            {/* empty - login/register buttons are in top right */}
          </div>
        </div>
      )}
    </div>
  );
}
