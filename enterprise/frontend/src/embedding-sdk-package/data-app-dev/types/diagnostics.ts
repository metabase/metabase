export type DevDiagnosticEvent =
  | { kind: "error"; message: string }
  | { kind: "blocked-api"; message: string }
  | {
      kind: "blocked-network";
      api: "fetch" | "xhr";
      url: string;
      reason: string;
    }
  | { kind: "csp-violation"; directive: string; blockedUri: string }
  | {
      kind: "sdk-call";
      method: string;
      endpoint: string;
      status: number | null;
      durationMs: number;
      // Why it failed: the response body on a non-2xx, the thrown message on a
      // transport failure. Absent on success.
      error?: string;
    };

export type DevDiagnosticEntry = {
  id: number;
  time: number;
} & DevDiagnosticEvent;
