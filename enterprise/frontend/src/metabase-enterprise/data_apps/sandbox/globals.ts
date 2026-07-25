/**
 * The single source of truth for the globals the data-app bundle is built
 * against. The app is built as one IIFE that assigns its factory to
 * `DATA_APP_FACTORY_GLOBAL`, with React + the SDK left external and mapped to
 * these names; the host's `createDataAppSandbox` (`./sandbox.ts`) endows
 * exactly these names — both sides import this map so the build-time and
 * runtime contracts can't drift.
 */
export const DATA_APP_GLOBAL_NAMES = {
  factory: "__dataAppFactory__",
} as const;

export const DATA_APP_FACTORY_GLOBAL = DATA_APP_GLOBAL_NAMES.factory;

/**
 * Each externalized import mapped to the global the sandbox endows it as.
 */
export const DATA_APP_GLOBALS: Record<string, string> = {};

/** The imports kept external, derived from `DATA_APP_GLOBALS` so the two can't drift. */
export const DATA_APP_EXTERNALS: string[] = Object.keys(DATA_APP_GLOBALS);
