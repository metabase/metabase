import type {
  DataAppDiagnosticPayload,
  InstanceConnectionStatus,
} from "../../types/diagnostics-channel";
import type { DataAppManifestStatus } from "../../types/manifest-status";

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

export const getTabAlertCounts = ({
  entries,
  manifest,
  connection,
}: {
  entries: DataAppDiagnosticPayload[];
  manifest: DataAppManifestStatus | null;
  connection: InstanceConnectionStatus | null;
}): Record<TabId, number> => ({
  errors: entries.filter((entry) => entry.kind === "error" && entry.alert)
    .length,
  blocked: entries.filter((entry) => isBlocked(entry) && entry.alert).length,
  queries: entries.filter(isFailedCall).length,
  manifest: manifest?.errors.length ?? 0,
  connection:
    connection && (!connection.reachable || connection.error != null) ? 1 : 0,
});
