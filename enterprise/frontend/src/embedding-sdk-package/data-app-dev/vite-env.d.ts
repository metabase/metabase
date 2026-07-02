// Ambient types for `dev-entry.tsx` (bundled by rspack, but type-checked by the
// main program). The dev app's env vars + Vite's `import.meta.env`/`.hot` and the
// dev plugin's config virtual module are declared here so `dev-entry.tsx` checks
// against real shapes. No other code declares `ImportMeta`, so this is the sole
// (global) declaration; the interfaces merge with the built-in `ImportMeta.url`.

interface ImportMetaEnv {
  readonly DATA_APP_MB_URL: string;
  readonly DATA_APP_MB_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly hot?: {
    on(event: string, cb: (...args: unknown[]) => void): void;
  };
}

declare module "virtual:metabase-data-app-dev-config" {
  export const allowedHosts: string[];
  export const bundleUrl: string;
  export const rebuiltEvent: string;
}
