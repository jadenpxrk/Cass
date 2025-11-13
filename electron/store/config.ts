import path from 'node:path';
import type { Stats } from 'node:fs';

// Lazy in-module store with minimal coupling to main
let store: any = null;

async function initializeStore() {
  try {
    const fs = await import('fs/promises');
    const userDataPath =
      process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(process.env.HOME || '', 'Library', 'Application Support')
        : path.join(process.env.HOME || '', '.config'));

    const configPath = path.join(userDataPath, 'cass', 'config.json');

    store = {
      _configPath: configPath,
      get: async (key: string) => {
        try {
          await fs.access(configPath);
        } catch {
          await fs.mkdir(path.dirname(configPath), { recursive: true });
          await fs.writeFile(configPath, JSON.stringify({}), 'utf8');
          return undefined;
        }
        try {
          const data = await fs.readFile(configPath, 'utf8');
          const config = JSON.parse(data || '{}');
          return config[key];
        } catch (readError) {
          console.error(`Error reading config file at ${configPath}:`, readError);
          try {
            await fs.writeFile(configPath, JSON.stringify({}), 'utf8');
          } catch (writeError) {
            console.error(`Failed to reset corrupted config file at ${configPath}:`, writeError);
          }
          return undefined;
        }
      },
      set: async (key: string, value: any) => {
        try {
          await fs.mkdir(path.dirname(configPath), { recursive: true });
          let config: Record<string, any> = {};
          try {
            const data = await fs.readFile(configPath, 'utf8');
            config = JSON.parse(data || '{}');
          } catch {
            // ignore
          }
          config = { ...config, [key]: value };
          await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
          return true;
        } catch (error) {
          console.error(`Error setting ${key} in config:`, error);
          return false;
        }
      },
    };
    return true;
  } catch (error) {
    console.error('Error initializing config store:', error);
    store = null;
    return false;
  }
}

export async function getStoreValue(key: string): Promise<any> {
  if (!store) {
    const initialized = await initializeStore();
    if (!initialized || !store) {
      console.error('Store access failed: Could not initialize store.');
      return undefined;
    }
  }
  return store.get(key);
}

export async function setStoreValue(key: string, value: any): Promise<boolean> {
  if (!store) {
    const initialized = await initializeStore();
    if (!initialized || !store) {
      console.error('Store access failed: Could not initialize store.');
      return false;
    }
  }
  return store.set(key, value);
}

