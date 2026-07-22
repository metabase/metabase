import type { DataAppManifestStatus } from "./manifest-status";

export interface InstanceConnectionStatus {
  checkedAt: number;
  metabaseUrl: string;
  reachable: boolean;
  sdkVersion: string | null;
  error?: string;
}

export interface DataAppDiagnosticEntry {
  time: number;
  kind: string;
  summary: string;
  detail: string | null;
  hint: string | null;
  alert: boolean;
}

export interface DataAppDiagnosticPayload extends DataAppDiagnosticEntry {
  eventId: number;
}

export interface DataAppDiagnosticsMessage {
  sessionId: string;
  entries: DataAppDiagnosticEntry[];
  connection: InstanceConnectionStatus | null;
}

export interface DataAppDiagnosticsReport {
  entries: DataAppDiagnosticPayload[];
  connection: InstanceConnectionStatus | null;
  manifest: DataAppManifestStatus | null;
  clients: number;
  lastReportAt: number | null;
  lastRebuildAt: number | null;
  /** Cursor for the next poll (`?startEventId=`): the last event's id + 1. */
  nextEventId: number;
  sessionId: string | null;
}

/** The part of the report the store owns; the rest comes from the dev server. */
export type DiagnosticsStoreReport = Omit<
  DataAppDiagnosticsReport,
  "manifest" | "clients" | "lastRebuildAt"
>;
