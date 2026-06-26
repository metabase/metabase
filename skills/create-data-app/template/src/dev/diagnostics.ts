// Dev-only diagnostics for the data-app dev harness. Captures errors (including
// the sandbox's `[data-app …] blocked API call: …` logs, which surface through
// `console.error`) so the dev toolbar can show what went wrong — the sandbox
// otherwise reports blocked APIs only as an opaque `#<Object>`.
//
// This module is imported only by `dev.tsx`, never by `src/index.tsx`, so it is
// never part of the production bundle.

export type DevDiagnosticLevel = "error";

export interface DevDiagnosticEntry {
  id: number;
  time: number;
  level: DevDiagnosticLevel;
  message: string;
}

const MAX_ENTRIES = 200;

let entries: DevDiagnosticEntry[] = [];
let nextId = 1;
let installed = false;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const formatArg = (arg: unknown): string => {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg instanceof Error) {
    return arg.stack ?? `${arg.name}: ${arg.message}`;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
};

const record = (level: DevDiagnosticLevel, message: string) => {
  // New array reference each time so `useSyncExternalStore` re-renders.
  entries = [...entries, { id: nextId++, time: Date.now(), level, message }];
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(-MAX_ENTRIES);
  }
  emit();
};

export const getDevDiagnostics = (): readonly DevDiagnosticEntry[] => entries;

export const subscribeDevDiagnostics = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const clearDevDiagnostics = (): void => {
  entries = [];
  emit();
};

/** Wraps `console.error` and listens for uncaught errors. Idempotent. */
export const installDevDiagnostics = (): void => {
  if (installed) {
    return;
  }
  installed = true;

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    record("error", args.map(formatArg).join(" "));
    originalError(...args);
  };

  window.addEventListener("error", (event) => {
    if (event.error != null || event.message) {
      record("error", formatArg(event.error ?? event.message));
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    record("error", `Unhandled rejection: ${formatArg(event.reason)}`);
  });
};
