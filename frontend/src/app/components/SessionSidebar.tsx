'use client';

import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';

interface Session {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface SessionSidebarProps {
  currentSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
}

export interface SessionSidebarRef {
  refreshSessions: () => void;
}

const SessionSidebar = forwardRef<SessionSidebarRef, SessionSidebarProps>(({
  currentSessionId,
  onSessionSelect,
  onNewSession
}, ref) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/sessions', {
        method: 'GET',
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      } else {
        console.error('Failed to fetch sessions');
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  useImperativeHandle(ref, () => ({
    refreshSessions: fetchSessions
  }));

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(Math.abs(diff) / (1000 * 60 * 60 * 24));

    // If the difference is negative (future date) or very small, treat as today
    if (diff < 0 || days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="w-80 bg-white border-r border-gray-300 shadow-lg flex flex-col h-screen">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold">Sessions</h2>
      </div>

      <div className="p-4">
        <button
          onClick={onNewSession}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium"
        >
          + New Session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-gray-400">No sessions yet</div>
        ) : (
          <div className="space-y-2 p-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSessionSelect(session.id)}
                className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                  currentSessionId === session.id
                    ? 'bg-blue-50 border-blue-300 text-blue-900'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className="font-medium text-sm truncate">
                  {session.title || 'Untitled Session'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {formatDate(session.updated_at)}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {session.message_count} messages
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

SessionSidebar.displayName = 'SessionSidebar';

export default SessionSidebar; 
