'use client';

import Editor from '@monaco-editor/react';
import { useState, useRef } from 'react';
import type { editor } from 'monaco-editor';

export default function Home() {
  const [problem, setProblem] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
  };

  const handleSubmit = async () => {
    const code = editorRef.current?.getValue() || '';
    
    if (!problem.trim()) {
      alert('Please enter a problem description');
      return;
    }

    setLoading(true);
    setResponse('');

    try {
      const res = await fetch('http://localhost:8000/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          problem: problem,
          code: code || null
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setResponse(data.response);
    } catch (error) {
      console.error('Error:', error);
      setResponse('Error connecting to the backend. Make sure the server is running on localhost:8000');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 min-h-screen flex items-center justify-center">
      <div className="flex gap-8">
        {/* Left side - Inputs */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">Code:</h2>
            <div className="rounded-lg border border-black overflow-hidden w-[500px]">
              <Editor
                height="400px"
                width="500px"
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
              onChange={(e) => setProblem(e.target.value)}
              className="w-[500px] h-32 p-3 rounded-lg border border-black resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter the problem description..."
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-[500px] py-2 px-4 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors duration-200 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Submitting...' : 'Submit'}
          </button>
        </div>

        {/* Right side - Response */}
        <div className="flex flex-col gap-2 w-[400px]">
          <h2 className="text-xl font-semibold">Response:</h2>
          <div className="min-h-[536px] p-4 rounded-lg border border-gray-300 bg-gray-50">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Loading...</div>
              </div>
            ) : response ? (
              <div className="text-purple-600 whitespace-pre-wrap break-words">
                {response}
              </div>
            ) : (
              <div className="text-gray-400 italic">
                Response will appear here after submission
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
