import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../types/mcp';

interface Props {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isConnected: boolean;
}

export const ChatInterface: React.FC<Props> = ({ messages, onSendMessage, isConnected }) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && isConnected) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          backgroundColor: '#fafafa',
        }}
      >
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#666', padding: '32px' }}>
            <p>No messages yet. Start a conversation!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '70%',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    backgroundColor: message.role === 'user' ? '#2196F3' : '#fff',
                    color: message.role === 'user' ? '#fff' : '#333',
                    border: message.role === 'user' ? 'none' : '1px solid #e0e0e0',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  }}
                >
                  <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{message.content}</div>
                  <div
                    style={{
                      fontSize: '12px',
                      opacity: 0.7,
                      marginTop: '4px',
                    }}
                  >
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          padding: '16px',
          borderTop: '1px solid #e0e0e0',
          backgroundColor: '#fff',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={isConnected ? "Type a message..." : "Connect to server first..."}
            disabled={!isConnected}
            style={{
              flex: 1,
              padding: '12px',
              fontSize: '14px',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!isConnected || !inputValue.trim()}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 'bold',
              color: '#fff',
              backgroundColor: isConnected ? '#2196F3' : '#ccc',
              border: 'none',
              borderRadius: '4px',
              cursor: isConnected ? 'pointer' : 'not-allowed',
            }}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
};