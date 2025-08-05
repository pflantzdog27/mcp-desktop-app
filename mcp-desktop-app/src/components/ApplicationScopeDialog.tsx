import React, { useState } from 'react';
import { ApplicationScopeSettings } from '../services/settings';

interface Props {
  settings: ApplicationScopeSettings;
  availableScopes: Array<{ id: string; name: string; scope: string; active?: boolean }>;
  onSelect: (scopeId: string, scopeName: string, locked: boolean) => void;
  onCancel: () => void;
}

export const ApplicationScopeDialog: React.FC<Props> = ({
  settings,
  availableScopes,
  onSelect,
  onCancel
}) => {
  const [selectedScope, setSelectedScope] = useState(
    settings.currentScope?.id || 'global'
  );
  const [lockSelection, setLockSelection] = useState(false);
  const [searchTerm, setSearchTerm] = useState(
    settings.currentScope?.name || 'Global'
  );
  const [showDropdown, setShowDropdown] = useState(false);

  // Filter scopes based on search term
  const filteredScopes = availableScopes.filter(scope =>
    scope.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedScopeData = availableScopes.find(s => s.id === selectedScope);

  const handleSubmit = () => {
    const scope = availableScopes.find(s => s.id === selectedScope);
    if (scope) {
      onSelect(scope.id, scope.name, lockSelection);
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
        <h2 style={{ marginTop: 0 }}>Select Application Scope</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Choose the application scope for creating new records and configurations.
        </p>

        <div style={{ marginBottom: '20px', position: 'relative' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Application Scope:
          </label>
          
          {/* Search Input */}
          <input
            type="text"
            placeholder="Search application scopes..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
          
          {/* Selected Scope Display */}
          {selectedScopeData && (
            <div style={{
              marginTop: '8px',
              padding: '8px 12px',
              backgroundColor: '#e3f2fd',
              borderRadius: '4px',
              border: '1px solid #2196F3'
            }}>
              <strong>Selected:</strong> {selectedScopeData.name}
            </div>
          )}
          
          {/* Dropdown */}
          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: '#fff',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 1001,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              {filteredScopes.length > 0 ? (
                filteredScopes.map(scope => (
                  <div
                    key={scope.id}
                    onClick={() => {
                      setSelectedScope(scope.id);
                      setSearchTerm(scope.name);
                      setShowDropdown(false);
                    }}
                    style={{
                      padding: '12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f0f0f0',
                      backgroundColor: selectedScope === scope.id ? '#f5f5f5' : '#fff'
                    }}
                    onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#f9f9f9'}
                    onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = selectedScope === scope.id ? '#f5f5f5' : '#fff'}
                  >
                    <div style={{ fontWeight: 'bold' }}>
                      {scope.name}
                      {scope.active === false && (
                        <span style={{ 
                          marginLeft: '8px', 
                          fontSize: '10px', 
                          color: '#f44336',
                          backgroundColor: '#ffebee',
                          padding: '2px 6px',
                          borderRadius: '3px'
                        }}>
                          INACTIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Scope: {scope.scope}</div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '12px', color: '#666', fontStyle: 'italic' }}>
                  No scopes found matching "{searchTerm}"
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Click outside to close dropdown */}
        {showDropdown && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000
            }}
            onClick={() => setShowDropdown(false)}
          />
        )}

        {settings.currentScope && (
          <div style={{ 
            padding: '12px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            marginBottom: '20px'
          }}>
            <strong>Current scope:</strong> {settings.currentScope.name}
          </div>
        )}

        <div style={{ marginBottom: '20px' }}>
          <label>
            <input
              type="checkbox"
              checked={lockSelection}
              onChange={(e) => setLockSelection(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Don't ask again (lock to this application scope)
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
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#2196F3',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};