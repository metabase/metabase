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
  private uncapturedConsoleError: typeof console.error | null = null;
  private readonly listeners = new Set<() => void>();

  /**
   * Wraps `console.error` and listens for uncaught errors.
   */
  install(): void {
    const originalError = console.error.bind(console);
    this.uncapturedConsoleError = originalError;

    console.error = (...args: unknown[]) => {
      this.record({
        kind: "error",
        message: args.map((arg) => this.formatArg(arg)).join(" "),
      });

      originalError(...args);
    };

    window.addEventListener("error", (event) => {
      if (event.error != null || event.message) {
        this.record({
          kind: "error",
          message: this.formatArg(event.error ?? event.message),
        });
      }
    });

    window.addEventListener("unhandledrejection", (event) => {
      this.record({
        kind: "error",
        message: `Unhandled rejection: ${this.formatArg(event.reason)}`,
      });
    });

    window.addEventListener("securitypolicyviolation", (event) => {
      this.record({
        kind: "csp-violation",
        directive: event.effectiveDirective || event.violatedDirective,
        blockedUri: event.blockedURI,
      });
    });
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

    let json: string | undefined;
    try {
      json = JSON.stringify(arg);
    } catch {}

    return truncateDiagnosticText(json ?? String(arg));
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
