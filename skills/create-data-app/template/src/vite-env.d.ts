interface ImportMetaEnv {
  readonly DATA_APP_MB_URL: string;
  readonly DATA_APP_MB_API_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly hot?: {
    on(event: string, callback: (data: unknown) => void): void;
  };
}

// Injected by `dataAppSandboxDevPlugin` (see `config/sandbox-dev-plugin.ts`).
/** Origins the sandboxed app may fetch/XHR, from `data_app.yml` `allowed_hosts`. */
declare const __DATA_APP_ALLOWED_HOSTS__: string[];
/** Dev URL serving the app pre-built as the production IIFE bundle. */
declare const __DATA_APP_BUNDLE_URL__: string;
/** Custom HMR event the plugin emits on rebuild for the soft reload. */
declare const __DATA_APP_REBUILT_EVENT__: string;
