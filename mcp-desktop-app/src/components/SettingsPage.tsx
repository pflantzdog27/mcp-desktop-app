import React, { useState } from 'react';
import { AppSettings, SettingsService } from '../services/settings';

interface Props {
  settingsService: SettingsService;
  onClose: () => void;
}

export const SettingsPage: React.FC<Props> = ({ settingsService, onClose }) => {
  const [settings, setSettings] = useState<AppSettings>(settingsService.getSettings());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    settingsService.updateSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateUpdateSetSettings = (updates: Partial<AppSettings['updateSet']>) => {
    setSettings({
      ...settings,
      updateSet: {
        ...settings.updateSet,
        ...updates
      }
    });
  };

  const updateScopeSettings = (updates: Partial<AppSettings['applicationScope']>) => {
    setSettings({
      ...settings,
      applicationScope: {
        ...settings.applicationScope,
        ...updates
      }
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#fff',
      overflowY: 'auto',
      zIndex: 900
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <h1 style={{ margin: 0 }}>Settings</h1>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              backgroundColor: '#fff',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>

        {/* Update Set Settings */}
        <section style={{ marginBottom: '40px' }}>
          <h2>Update Set Management</h2>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
              <input
                type="checkbox"
                checked={settings.updateSet.enabled}
                onChange={(e) => updateUpdateSetSettings({ enabled: e.target.checked })}
                style={{ marginRight: '8px' }}
              />
              <span>Enable update set management</span>
            </label>
            <p style={{ color: '#666', marginLeft: '24px', marginTop: '4px' }}>
              Prompt for update set selection before create/modify operations
            </p>
          </div>

          {settings.updateSet.enabled && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>
                  Update Set Prefix:
                </label>
                <input
                  type="text"
                  value={settings.updateSet.prefix}
                  onChange={(e) => updateUpdateSetSettings({ prefix: e.target.value })}
                  style={{
                    padding: '8px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '4px',
                    width: '200px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>
                  Naming Pattern:
                </label>
                <input
                  type="text"
                  value={settings.updateSet.namingPattern}
                  onChange={(e) => updateUpdateSetSettings({ namingPattern: e.target.value })}
                  style={{
                    padding: '8px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '4px',
                    width: '400px'
                  }}
                />
                <p style={{ color: '#666', marginTop: '4px' }}>
                  Available variables: {'{prefix}'}, {'{date}'}, {'{description}'}
                </p>
              </div>

              {settings.updateSet.currentUpdateSet && (
                <div style={{ 
                  padding: '16px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>Current Update Set:</strong> {settings.updateSet.currentUpdateSet.name}
                      {settings.updateSet.locked && (
                        <span style={{ marginLeft: '8px', color: '#666' }}>(Locked)</span>
                      )}
                    </div>
                    {settings.updateSet.locked && (
                      <button
                        onClick={() => {
                          updateUpdateSetSettings({ locked: false });
                          handleSave();
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          backgroundColor: '#ff9800',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        🔓 Unlock
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Application Scope Settings */}
        <section style={{ marginBottom: '40px' }}>
          <h2>Application Scope Management</h2>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
              <input
                type="checkbox"
                checked={settings.applicationScope.enabled}
                onChange={(e) => updateScopeSettings({ enabled: e.target.checked })}
                style={{ marginRight: '8px' }}
              />
              <span>Enable application scope management</span>
            </label>
            <p style={{ color: '#666', marginLeft: '24px', marginTop: '4px' }}>
              Prompt for application scope selection before create/modify operations
            </p>
          </div>

          {settings.applicationScope.enabled && settings.applicationScope.currentScope && (
            <div style={{ 
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>Current Application Scope:</strong> {settings.applicationScope.currentScope.name}
                  {settings.applicationScope.locked && (
                    <span style={{ marginLeft: '8px', color: '#666' }}>(Locked)</span>
                  )}
                </div>
                {settings.applicationScope.locked && (
                  <button
                    onClick={() => {
                      updateScopeSettings({ locked: false });
                      handleSave();
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      backgroundColor: '#ff9800',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    🔓 Unlock
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Save Button */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          justifyContent: 'flex-end',
          borderTop: '1px solid #e0e0e0',
          paddingTop: '24px'
        }}>
          {saved && (
            <span style={{ color: '#4CAF50', marginRight: '12px', alignSelf: 'center' }}>
              ✓ Settings saved
            </span>
          )}
          <button
            onClick={handleSave}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#4CAF50',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};