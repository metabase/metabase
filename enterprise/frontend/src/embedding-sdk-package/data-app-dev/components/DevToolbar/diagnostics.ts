import type { SandboxBlockedEvent } from "metabase-enterprise/data_apps/sandbox/types";

import {
  trimDiagnosticEntries,
  truncateDiagnosticText,
} from "../../lib/diagnostics-limits";
import type {
  DevDiagnosticEntry,
  DevDiagnosticEvent,
} from "../../types/diagnostics";
import type { InstanceConnectionStatus } from "../../types/diagnostics-channel";

/**
 * In-page collector of what the dev preview captured — uncaught errors, CSP
 * violations, sandbox blocks, SDK calls — plus the instance connection status.
 * `install()` starts the capture; readers (the toolbar, the reporter) subscribe.
 */
export class DevDiagnosticsCollector {
  private entries: DevDiagnosticEntry[] = [];
  private connectionStatus: InstanceConnectionStatus | null = null;
  private nextEntryId = 1;
  private installed = false;
  private uncapturedConsoleError: typeof console.error | null = null;
  private readonly listeners = new Set<() => void>();

  /**
   * Wraps `console.error` and listens for uncaught errors. Idempotent — a second
   * `install()` is a no-op — so an HMR reload can't re-wrap the already-wrapped
   * `console.error` and double every capture. Returns a teardown the caller can
   * run to restore everything; only the unit tests do.
   */
  install(): () => void {
    if (this.installed || typeof window === "undefined") {
      return () => undefined;
    }

    this.installed = true;

    const originalError = console.error.bind(console);
    this.uncapturedConsoleError = originalError;

    console.error = (...args: unknown[]) => {
      this.record({
        kind: "error",
        message: args.map((arg) => this.formatArg(arg)).join(" "),
      });

      originalError(...args);
    };

    const onError = (event: ErrorEvent) => {
      if (event.error != null || event.message) {
        this.record({
          kind: "error",
          message: this.formatArg(event.error ?? event.message),
        });
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      this.record({
        kind: "error",
        message: `Unhandled rejection: ${this.formatArg(event.reason)}`,
      });
    };

    const onCspViolation = (event: SecurityPolicyViolationEvent) => {
      this.record({
        kind: "csp-violation",
        directive: event.effectiveDirective || event.violatedDirective,
        blockedUri: event.blockedURI,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("securitypolicyviolation", onCspViolation);

    return () => {
      console.error = originalError;
      this.uncapturedConsoleError = null;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("securitypolicyviolation", onCspViolation);
      this.installed = false;
    };
  }

  record(event: DevDiagnosticEvent): void {
    const newEntry = {
      id: this.nextEntryId++,
      time: Date.now(),
      ...this.truncateEventText(event),
    };

    this.entries = trimDiagnosticEntries([...this.entries, newEntry]);
    this.emit();
  }

  recordSandboxBlocked = (event: SandboxBlockedEvent): void => {
    if (event.type === "api") {
      this.record({ kind: "blocked-api", message: event.message });
      this.logToConsole(event.message);

      return;
    }

    this.record({
      kind: "blocked-network",
      api: event.api,
      url: event.url,
      reason: event.reason,
    });

    this.logToConsole(
      `[data-app dev] blocked ${event.api === "xhr" ? "XMLHttpRequest" : "fetch"} to ${event.reason}`,
    );
  };

  getEntries = (): readonly DevDiagnosticEntry[] => this.entries;

  getConnectionStatus(): InstanceConnectionStatus | null {
    return this.connectionStatus;
  }

  setConnectionStatus(status: InstanceConnectionStatus): void {
    this.connectionStatus = status;
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  clear = (): void => {
    this.entries = [];
    this.emit();
  };

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private logToConsole(message: string) {
    this.uncapturedConsoleError?.(message);
  }

  private formatArg(arg: unknown): string {
    if (typeof arg === "string") {
      return truncateDiagnosticText(arg);
    }

    if (arg instanceof Error && arg.stack) {
      return truncateDiagnosticText(arg.stack);
    }

    try {
      return truncateDiagnosticText(JSON.stringify(arg));
    } catch {
      return truncateDiagnosticText(String(arg));
    }
  }

  private truncateEventText(event: DevDiagnosticEvent): DevDiagnosticEvent {
    // Safe cast: only string values are rewritten, so the shape is unchanged.
    return Object.fromEntries(
      Object.entries(event).map(([key, value]) => [
        key,
        typeof value === "string" ? truncateDiagnosticText(value) : value,
      ]),
    ) as DevDiagnosticEvent;
  }
}

export const devDiagnostics = new DevDiagnosticsCollector();
