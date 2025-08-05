export interface UpdateSetSettings {
  enabled: boolean;
  prefix: string;
  namingPattern: string; // e.g., "{prefix}_{date}_{description}"
  currentUpdateSet?: {
    id: string;
    name: string;
  };
  locked: boolean; // When true, don't prompt for update set changes
}

export interface ApplicationScopeSettings {
  enabled: boolean;
  currentScope?: {
    id: string;
    name: string;
  };
  locked: boolean; // When true, don't prompt for scope changes
}

export interface AppSettings {
  updateSet: UpdateSetSettings;
  applicationScope: ApplicationScopeSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  updateSet: {
    enabled: true,
    prefix: 'MCPD',
    namingPattern: '{prefix}_{date}_{description}',
    locked: false
  },
  applicationScope: {
    enabled: true,
    locked: false
  }
};

export class SettingsService {
  private settings: AppSettings;
  private readonly STORAGE_KEY = 'mcp-desktop-settings';

  constructor() {
    this.settings = this.loadSettings();
  }

  private loadSettings(): AppSettings {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle new settings
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          updateSet: {
            ...DEFAULT_SETTINGS.updateSet,
            ...parsed.updateSet
          },
          applicationScope: {
            ...DEFAULT_SETTINGS.applicationScope,
            ...parsed.applicationScope
          }
        };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    return DEFAULT_SETTINGS;
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<AppSettings>): void {
    this.settings = {
      ...this.settings,
      ...updates
    };
    this.saveSettings();
  }

  setCurrentUpdateSet(id: string, name: string): void {
    this.settings.updateSet.currentUpdateSet = { id, name };
    this.saveSettings();
  }

  setCurrentScope(id: string, name: string): void {
    this.settings.applicationScope.currentScope = { id, name };
    this.saveSettings();
  }

  lockUpdateSet(locked: boolean): void {
    this.settings.updateSet.locked = locked;
    this.saveSettings();
  }

  lockApplicationScope(locked: boolean): void {
    this.settings.applicationScope.locked = locked;
    this.saveSettings();
  }

  generateUpdateSetName(description: string): string {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return this.settings.updateSet.namingPattern
      .replace('{prefix}', this.settings.updateSet.prefix)
      .replace('{date}', date)
      .replace('{description}', description.replace(/\s+/g, '_'));
  }

  needsUpdateSetPrompt(toolName: string): boolean {
    if (!this.settings.updateSet.enabled || this.settings.updateSet.locked) {
      return false;
    }
    // Check if this is a create/modify operation
    return this.isModifyingTool(toolName);
  }

  needsScopePrompt(toolName: string): boolean {
    if (!this.settings.applicationScope.enabled || this.settings.applicationScope.locked) {
      return false;
    }
    // Check if this is a create/modify operation
    return this.isModifyingTool(toolName);
  }

  private isModifyingTool(toolName: string): boolean {
    const modifyingKeywords = [
      'create', 'add', 'update', 'modify', 'set', 'implement',
      'delete', 'remove', 'change'
    ];
    const readOnlyKeywords = [
      'query', 'search', 'get', 'list', 'find', 'test', 'discover'
    ];
    
    const lowerToolName = toolName.toLowerCase();
    
    // Check if it's explicitly read-only
    if (readOnlyKeywords.some(keyword => lowerToolName.includes(keyword))) {
      return false;
    }
    
    // Check if it's a modifying operation
    return modifyingKeywords.some(keyword => lowerToolName.includes(keyword));
  }
}