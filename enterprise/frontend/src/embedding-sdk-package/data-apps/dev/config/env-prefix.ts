/**
 * The only env vars `import.meta.env` exposes, in the dev preview and in a production build alike. `DATA_APP_MB_URL`
 * and `DATA_APP_MB_API_KEY` stay in the dev server, which relays the instance itself. Vite's default prefix, `VITE_`,
 * would expose other secrets from the repo-root `.env.local` or the shell, and a build inlines every exposed var the
 * bundle reads into `dist/index.js`, which every viewer of the app downloads.
 */
export const DATA_APP_PUBLIC_ENV_PREFIX = "DATA_APP_PUBLIC_";
