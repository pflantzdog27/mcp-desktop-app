import React, { useState } from 'react';
import { UpdateSetSettings } from '../services/settings';

interface Props {
  settings: UpdateSetSettings;
  availableUpdateSets: Array<{ id: string; name: string }>;
  onSelect: (updateSetId: string, updateSetName: string, locked: boolean) => void;
  onCreate: (name: string, description: string) => Promise<{ id: string; name: string }>;
  onCancel: () => void;
}

export const UpdateSetDialog: React.FC<Props> = ({
  settings,
  availableUpdateSets,
  onSelect,
  onCreate,
  onCancel
}) => {
  const [selectedOption, setSelectedOption] = useState<'current' | 'existing' | 'new'>(
    settings.currentUpdateSet ? 'current' : 'new'
  );
  const [selectedExisting, setSelectedExisting] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [lockSelection, setLockSelection] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleSubmit = async () => {
    if (selectedOption === 'current' && settings.currentUpdateSet) {
      onSelect(settings.currentUpdateSet.id, settings.currentUpdateSet.name, lockSelection);
    } else if (selectedOption === 'existing' && selectedExisting) {
      const updateSet = availableUpdateSets.find(us => us.id === selectedExisting);
      if (updateSet) {
        onSelect(updateSet.id, updateSet.name, lockSelection);
      }
    } else if (selectedOption === 'new' && newDescription) {
      setCreating(true);
      try {
        const newUpdateSet = await onCreate(settings.prefix, newDescription);
        onSelect(newUpdateSet.id, newUpdateSet.name, lockSelection);
      } catch (error) {
        console.error('Failed to create update set:', error);
        setCreating(false);
      }
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <h2 style={{ marginTop: 0 }}>Select Update Set</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          This operation will modify ServiceNow. Please select an update set to track your changes.
        </p>

        <div style={{ marginBottom: '20px' }}>
          {settings.currentUpdateSet && (
            <label style={{ display: 'block', marginBottom: '12px' }}>
              <input
                type="radio"
                value="current"
                checked={selectedOption === 'current'}
                onChange={(_e) => setSelectedOption('current')}
                style={{ marginRight: '8px' }}
              />
              Use current: <strong>{settings.currentUpdateSet.name}</strong>
            </label>
          )}

          <label style={{ display: 'block', marginBottom: '12px' }}>
            <input
              type="radio"
              value="existing"
              checked={selectedOption === 'existing'}
              onChange={(_e) => setSelectedOption('existing')}
              style={{ marginRight: '8px' }}
            />
            Select existing update set:
          </label>
          
          {selectedOption === 'existing' && (
            <select
              value={selectedExisting}
              onChange={(e) => setSelectedExisting(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                marginLeft: '24px',
                marginBottom: '12px',
                border: '1px solid #e0e0e0',
                borderRadius: '4px'
              }}
            >
              <option value="">-- Select Update Set --</option>
              {availableUpdateSets.map(us => (
                <option key={us.id} value={us.id}>{us.name}</option>
              ))}
            </select>
          )}

          <label style={{ display: 'block', marginBottom: '12px' }}>
            <input
              type="radio"
              value="new"
              checked={selectedOption === 'new'}
              onChange={(_e) => setSelectedOption('new')}
              style={{ marginRight: '8px' }}
            />
            Create new update set:
          </label>

          {selectedOption === 'new' && (
            <input
              type="text"
              placeholder="Description (e.g., MCP Desktop Changes)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                marginLeft: '24px',
                marginBottom: '12px',
                border: '1px solid #e0e0e0',
                borderRadius: '4px'
              }}
            />
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label>
            <input
              type="checkbox"
              checked={lockSelection}
              onChange={(e) => setLockSelection(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Don't ask again (lock to this update set)
          </label>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              backgroundColor: '#fff',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              creating ||
              (selectedOption === 'existing' && !selectedExisting) ||
              (selectedOption === 'new' && !newDescription)
            }
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#2196F3',
              color: '#fff',
              cursor: 'pointer',
              opacity: creating ? 0.6 : 1
            }}
          >
            {creating ? 'Creating...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};