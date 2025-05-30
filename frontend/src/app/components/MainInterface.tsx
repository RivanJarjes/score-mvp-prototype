'use client';

import { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  problem?: string;
  code?: string;
  syntax_errors?: string;
}

interface MainInterfaceProps {
  problem: string;
  messages: Message[];
  loading: boolean;
  sessionTitle: string | null;
  onProblemChange: (value: string) => void;
  onSubmit: () => void;
  onNewSession: () => void;
  editorRef: React.RefObject<editor.IStandaloneCodeEditor | null>;
}

export default function MainInterface({
  problem,
  messages,
  loading,
  sessionTitle,
  onProblemChange,
  onSubmit,
  editorRef
}: MainInterfaceProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
  };

  const formatMessageContent = (msg: Message) => {
    if (msg.role === 'user') {
      const parts = msg.content.split('\n\nProblem:\n');
      const codePart = parts[0]?.replace('Code:\n', '') || '';
      const problemPart = parts[1] || msg.problem || '';
      
      return (
        <div className="space-y-2">
          {codePart && (
            <div>
              <div className="text-sm font-medium text-gray-600 mb-1">Code:</div>
              <pre className="bg-gray-100 p-2 rounded text-sm overflow-x-auto">
                <code>{codePart}</code>
              </pre>
            </div>
          )}
          {problemPart && (
            <div>
              <div className="text-sm font-medium text-gray-600 mb-1">Problem:</div>
              <div className="text-sm">{problemPart}</div>
            </div>
          )}
        </div>
      );
    }
    
    return <div className="text-sm whitespace-pre-wrap">{msg.content}</div>;
  };

  return (
    <div className="flex h-screen">
      {/* Left side - Input area */}
      <div className="w-1/2 p-4 border-r border-gray-300 flex flex-col">
        <div className="flex flex-col gap-4 flex-1">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">Code:</h2>
            <div className="rounded-lg border border-black overflow-hidden flex-1">
              <Editor
                height="300px"
                defaultLanguage="python"
                theme="light"
                onMount={handleEditorDidMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  roundedSelection: true,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  contextmenu: false,
                  quickSuggestions: false,
                  suggestOnTriggerCharacters: false,
                  acceptSuggestionOnEnter: 'off',
                  tabCompletion: 'off',
                  wordBasedSuggestions: 'off'
                }}
              />
            </div>
          </div>
          
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">Problem:</h2>
            <textarea
              value={problem}
              onChange={(e) => onProblemChange(e.target.value)}
              className="h-32 p-3 rounded-lg border border-black resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter the problem description..."
            />
          </div>

          <button
            onClick={onSubmit}
            disabled={loading}
            className="py-2 px-4 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors duration-200 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>

      {/* Right side - Convo */}
      <div className="w-1/2 p-4 flex flex-col">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Conversation</h2>
          {sessionTitle && (
            <p className="text-gray-600 text-sm mt-1">Session: {sessionTitle}</p>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.length === 0 && !loading ? (
            <div className="text-gray-400 italic text-center mt-8">
              Start a conversation by entering your code and problem description, then click Submit.
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`p-4 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-50 border-l-4 border-blue-500'
                    : 'bg-gray-50 border-l-4 border-gray-500'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`font-medium text-sm ${
                    message.role === 'user' ? 'text-blue-700' : 'text-gray-700'
                  }`}>
                    {message.role === 'user' ? 'You' : 'Assistant'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(message.created_at).toLocaleTimeString()}
                  </span>
                </div>
                {formatMessageContent(message)}
              </div>
            ))
          )}
          
          {loading && (
            <div className="p-4 rounded-lg bg-gray-50 border-l-4 border-gray-500">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-sm text-gray-700">Assistant</span>
                <span className="text-xs text-gray-500">Now</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
                <span className="text-sm text-gray-600">Thinking...</span>
              </div>
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>
      </div>
    </div>
  );
} 
