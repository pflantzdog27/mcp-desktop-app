import React from 'react';
import { ConnectionStatus as ConnectionStatusType } from '../types/mcp';

interface Props {
  status: ConnectionStatusType;
}

export const ConnectionStatus: React.FC<Props> = ({ status }) => {
  const getStatusColor = () => {
    switch (status.status) {
      case 'connected':
        return '#4CAF50';
      case 'connecting':
        return '#FF9800';
      case 'disconnected':
        return '#9E9E9E';
      case 'error':
        return '#F44336';
    }
  };

  const getStatusText = () => {
    switch (status.status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return `Error: ${status.message || 'Unknown error'}`;
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px' }}>
      <div
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: getStatusColor(),
        }}
      />
      <span style={{ fontSize: '14px', color: '#666' }}>{getStatusText()}</span>
    </div>
  );
};