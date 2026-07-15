// Dev diagnostics store for the data-app dev toolbar. Captures errors —
// including the sandbox's `[data-app …] blocked API call: …` logs, which surface
// through `console.error` — so the toolbar can show what went wrong (the sandbox
// otherwise reports blocked APIs only as an opaque `#<Object>`).
//
// Capture is opt-in: it only patches `console.error` / listens for uncaught
// errors once `installDevDiagnostics()` is called. Nothing here runs on import,
// so a host that imports `createDataAppSandbox` from the same entry doesn't pull
// any of this in unless it's actually used.

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

/**
 * Format a CSP violation for the toolbar. The dev server mirrors Metabase's
 * production CSP, so a violation here means the app would be blocked once
 * sandboxed in Metabase too — e.g. a native `<form action="…">` hitting
 * `form-action 'none'`, or a `fetch` to a host outside `allowed_hosts`. These
 * never reach `console.error`, so the toolbar wouldn't see them otherwise.
 */
const formatCspViolation = (event: SecurityPolicyViolationEvent): string => {
  const directive = event.effectiveDirective || event.violatedDirective;
  const target = event.blockedURI || "inline content";

  return `Content Security Policy (${directive}) blocked ${target}`;
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

/**
 * Start capturing errors into the diagnostics store: wraps `console.error` and
 * listens for uncaught errors / unhandled rejections. Idempotent. Call it before
 * the sandbox runs so nothing is missed.
 */
export const installDevDiagnostics = (): void => {
  if (installed || typeof window === "undefined") {
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

  window.addEventListener("securitypolicyviolation", (event) => {
    record("error", formatCspViolation(event));
  });
};
