import React from 'react';
import { Tool } from '../types/mcp';

interface Props {
  tools: Tool[];
}

export const ToolsList: React.FC<Props> = ({ tools }) => {
  return (
    <div style={{ padding: '16px', borderLeft: '1px solid #e0e0e0', minWidth: '250px' }}>
      <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Available Tools</h3>
      {tools.length === 0 ? (
        <p style={{ color: '#666', fontSize: '14px' }}>No tools discovered yet</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {tools.map((tool) => (
            <div
              key={tool.name}
              style={{
                padding: '12px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                border: '1px solid #e0e0e0',
              }}
            >
              <h4 style={{ margin: 0, fontSize: '16px', color: '#333' }}>{tool.name}</h4>
              {tool.description && (
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#666' }}>
                  {tool.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};