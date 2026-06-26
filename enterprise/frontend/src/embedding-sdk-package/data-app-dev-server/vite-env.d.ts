// Ambient types for the dev harness (see `tsconfig.json` in this dir). The app's
// env vars augment Vite's `ImportMetaEnv`, and the dev plugin's config virtual
// module is declared here so `harness.ts` type-checks against real shapes.

interface ImportMetaEnv {
  readonly VITE_MB_URL: string;
  readonly VITE_MB_API_KEY: string;
}

declare module "virtual:metabase-data-app-dev-config" {
  export const allowedHosts: string[];
  export const bundleUrl: string;
  export const rebuiltEvent: string;
}
