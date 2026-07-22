import {
  capDiagnosticEntries,
  truncateDiagnosticText,
} from "../lib/diagnostics-limits";
import type {
  DataAppDiagnosticEntry,
  DataAppDiagnosticPayload,
  DataAppDiagnosticsMessage,
  DiagnosticsStoreReport,
  InstanceConnectionStatus,
} from "../types/diagnostics-channel";

/**
 * The dev server's buffer of what the preview page reported.
 **/
export class DiagnosticsStore {
  private entries: DataAppDiagnosticPayload[] = [];
  private connection: InstanceConnectionStatus | null = null;
  private lastReportAt: number | null = null;
  private sessionId: string | null = null;
  // Ids are assigned here rather than taken from the page, whose counter
  // restarts at 1 on every reload: a reader that already read up to 40 would
  // then skip everything the reloaded page reports.
  private nextEntryId = 1;

  applyMessage(message: DataAppDiagnosticsMessage): boolean {
    this.lastReportAt = Date.now();

    const connectionChanged = this.applyConnection(message?.connection);
    const sessionChanged = this.applySession(message?.sessionId);
    const entriesAdded = this.appendEntries(message?.entries);

    // Returns whether a reader would now see something different.
    return connectionChanged || sessionChanged || entriesAdded;
  }

  clear(): void {
    this.entries = [];
  }

  /**
   * Gets report starting from `startEventId`
   **/
  getReport(startEventId: number): DiagnosticsStoreReport {
    return {
      entries: Number.isFinite(startEventId)
        ? this.entries.filter((entry) => entry.eventId >= startEventId)
        : this.entries,
      connection: this.connection,
      lastReportAt: this.lastReportAt,
      sessionId: this.sessionId,
      nextEventId: (this.entries.at(-1)?.eventId ?? 0) + 1,
    };
  }

  private applyConnection(
    nextConnection: InstanceConnectionStatus | null | undefined,
  ): boolean {
    if (!nextConnection) {
      return false;
    }

    // Compare by `checkedAt`, not by reference: every message arrives off the
    // socket as a fresh object, so a reference check would call each a change.
    const changed = nextConnection.checkedAt !== this.connection?.checkedAt;
    this.connection = nextConnection;

    return changed;
  }

  private applySession(sessionId: string | undefined): boolean {
    if (!sessionId || sessionId === this.sessionId) {
      return false;
    }

    // A new page: drop the previous one's events, but keep `nextEntryId`
    // climbing so an existing poller's cursor stays valid.
    if (this.sessionId !== null) {
      this.entries = [];
    }

    this.sessionId = sessionId;

    return true;
  }

  private appendEntries(
    entries: DataAppDiagnosticEntry[] | undefined,
  ): boolean {
    if (!Array.isArray(entries) || entries.length === 0) {
      return false;
    }

    this.entries = capDiagnosticEntries([
      ...this.entries,
      ...entries.map((entry) => this.toStoredEntry(entry)),
    ]);

    return true;
  }

  private toStoredEntry(
    entry: DataAppDiagnosticEntry,
  ): DataAppDiagnosticPayload {
    return {
      ...entry,
      summary: truncateDiagnosticText(entry.summary ?? ""),
      detail:
        entry.detail == null ? null : truncateDiagnosticText(entry.detail),
      eventId: this.nextEntryId++,
    };
  }
}
