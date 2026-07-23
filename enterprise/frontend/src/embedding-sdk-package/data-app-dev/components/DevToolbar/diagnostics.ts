import type { SandboxBlockedEvent } from "metabase-enterprise/data_apps/sandbox/distortions";

import {
  capDiagnosticEntries,
  truncateDiagnosticText,
} from "../../lib/diagnostics-limits";
import type {
  DevDiagnosticEntry,
  DevDiagnosticEvent,
} from "../../types/diagnostics";
import type { DevConnectionStatus } from "../../types/diagnostics-channel";

let entries: DevDiagnosticEntry[] = [];
let connectionStatus: DevConnectionStatus | null = null;
let nextId = 1;
let installed = false;
let uncapturedConsoleError: typeof console.error | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const formatArg = (arg: unknown): string => {
  if (typeof arg === "string") {
    return truncateDiagnosticText(arg);
  }
  if (arg instanceof Error) {
    return truncateDiagnosticText(arg.stack ?? `${arg.name}: ${arg.message}`);
  }
  try {
    return truncateDiagnosticText(JSON.stringify(arg));
  } catch {
    return truncateDiagnosticText(String(arg));
  }
};

const cappedEvent = (event: DevDiagnosticEvent): DevDiagnosticEvent =>
  // Rebuilding the union through entries() loses the `kind`→fields tie; values
  // are only ever mapped string→string.
  Object.fromEntries(
    Object.entries(event).map(([key, value]) => [
      key,
      typeof value === "string" ? truncateDiagnosticText(value) : value,
    ]),
  ) as DevDiagnosticEvent;

export const recordDevDiagnostic = (event: DevDiagnosticEvent): void => {
  // New array reference each time so `useSyncExternalStore` re-renders.
  entries = capDiagnosticEntries([
    ...entries,
    { id: nextId++, time: Date.now(), ...cappedEvent(event) },
  ]);
  emit();
};

const logDevDiagnosticToConsole = (message: string): void => {
  (uncapturedConsoleError ?? console.error)(message);
};

export const recordSandboxBlockedEvent = (event: SandboxBlockedEvent): void => {
  if (event.type === "api") {
    recordDevDiagnostic({ kind: "blocked-api", message: event.message });
    logDevDiagnosticToConsole(event.message);
    return;
  }
  recordDevDiagnostic({
    kind: "blocked-network",
    api: event.api,
    url: event.url,
    reason: event.reason,
  });
  logDevDiagnosticToConsole(
    `[data-app dev] blocked ${event.api === "xhr" ? "XMLHttpRequest" : "fetch"} to ${event.reason}`,
  );
};

export const getDevDiagnostics = (): readonly DevDiagnosticEntry[] => entries;

export const getDevConnectionStatus = (): DevConnectionStatus | null =>
  connectionStatus;

export const setDevConnectionStatus = (status: DevConnectionStatus): void => {
  connectionStatus = status;
  emit();
};

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
 * Wraps `console.error` and listens for uncaught errors. Idempotent; call before
 * the sandbox runs so nothing is missed. The teardown matters: without it, an HMR
 * reload re-wraps the already-wrapped `console.error` and doubles every capture.
 */
export const installDevDiagnostics = (): (() => void) => {
  if (installed || typeof window === "undefined") {
    return () => undefined;
  }
  installed = true;

  const originalError = console.error.bind(console);
  uncapturedConsoleError = originalError;
  console.error = (...args: unknown[]) => {
    recordDevDiagnostic({
      kind: "error",
      message: args.map(formatArg).join(" "),
    });
    originalError(...args);
  };

  const onError = (event: ErrorEvent) => {
    if (event.error != null || event.message) {
      recordDevDiagnostic({
        kind: "error",
        message: formatArg(event.error ?? event.message),
      });
    }
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    recordDevDiagnostic({
      kind: "error",
      message: `Unhandled rejection: ${formatArg(event.reason)}`,
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  const onCspViolation = (event: SecurityPolicyViolationEvent) => {
    recordDevDiagnostic({
      kind: "csp-violation",
      directive: event.effectiveDirective || event.violatedDirective,
      blockedUri: event.blockedURI,
    });
  };

  window.addEventListener("securitypolicyviolation", onCspViolation);

  return () => {
    console.error = originalError;
    uncapturedConsoleError = null;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("securitypolicyviolation", onCspViolation);
    installed = false;
  };
};
