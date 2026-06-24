interface ImportMetaEnv {
  readonly VITE_MB_URL: string;
  readonly VITE_MB_API_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
