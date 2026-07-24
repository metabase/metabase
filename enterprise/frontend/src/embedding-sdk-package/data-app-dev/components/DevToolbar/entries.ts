import type { DataAppDiagnosticPayload } from "../../types/diagnostics-channel";

export type TabId =
  | "errors"
  | "blocked"
  | "queries"
  | "manifest"
  | "connection";

export const TABS: { id: TabId; label: string }[] = [
  { id: "errors", label: "Errors" },
  { id: "blocked", label: "Blocked" },
  { id: "queries", label: "Queries" },
  { id: "manifest", label: "Manifest" },
  { id: "connection", label: "Connection" },
];

const BLOCKED_KINDS = ["blocked-api", "blocked-network", "csp-violation"];

export const isBlocked = (entry: DataAppDiagnosticPayload): boolean =>
  BLOCKED_KINDS.includes(entry.kind);

export const isFailedCall = (entry: DataAppDiagnosticPayload): boolean =>
  entry.kind === "sdk-call" && entry.alert;
