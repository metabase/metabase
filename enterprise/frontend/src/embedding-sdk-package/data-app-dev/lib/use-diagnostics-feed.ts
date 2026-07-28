import { useCallback, useEffect, useRef, useState } from "react";

import { DATA_APP_DIAGNOSTICS_URL } from "../constants/diagnostics-channel";
import { DIAGNOSTICS_POLL_MS } from "../constants/timings";
import type {
  DataAppDiagnosticPayload,
  DataAppDiagnosticsReport,
  InstanceConnectionStatus,
} from "../types/diagnostics-channel";
import type { DataAppManifestStatus } from "../types/manifest-status";

export type SubscribeToChanges = (onChange: () => void) => () => void;

export type DiagnosticsFeedProblem =
  | { kind: "unreachable" }
  | { kind: "http"; status: number };

export interface DiagnosticsFeed {
  entries: DataAppDiagnosticPayload[];
  connection: InstanceConnectionStatus | null;
  manifest: DataAppManifestStatus | null;
  clients: number;
  lastReportAt: number | null;
  lastRebuildAt: number | null;
  problem: DiagnosticsFeedProblem | null;
  loaded: boolean;
  clear: () => void;
}

const EMPTY_ENTRIES: DataAppDiagnosticPayload[] = [];

/**
 * Mirrors the dev server's diagnostics report — what the preview page has
 * captured, plus the connection and manifest status — for the toolbar to
 * render, and exposes `clear` to empty it for every reader.
 *
 * The endpoint is the single source of truth: the hook never reads the page's
 * in-memory collector, so the toolbar and a shell agent polling the same URL
 * can't diverge. `subscribe` (the dev server's "feed changed" nudge over the
 * HMR socket) makes updates immediate; the hook polls regardless, because a
 * dev-server restart can leave that socket unconnectable.
 */
export const useDiagnosticsFeed = (
  url: string = DATA_APP_DIAGNOSTICS_URL,
  subscribe?: SubscribeToChanges,
): DiagnosticsFeed => {
  const [report, setReport] = useState<DataAppDiagnosticsReport | null>(null);
  const [problem, setProblem] = useState<DiagnosticsFeedProblem | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Each read replaces state with the endpoint's whole report rather than
  // fetching only what is new, so there is no cursor to keep or batch to stitch.
  // Reads are numbered instead: only the newest issued may apply its result, so
  // a slow read can't overwrite a fresher one, and `clear` can void reads still
  // in flight.
  const latestRead = useRef(0);
  const pendingClear = useRef<Promise<void> | null>(null);

  const readFeed = useCallback(async () => {
    await pendingClear.current;

    const readId = ++latestRead.current;

    try {
      const response = await fetch(url);

      if (readId !== latestRead.current) {
        return;
      }

      if (!response.ok) {
        setProblem({ kind: "http", status: response.status });
        return;
      }

      // `json()` returns `any`
      const next = (await response.json()) as DataAppDiagnosticsReport;

      if (readId !== latestRead.current) {
        return;
      }

      setProblem(null);
      setIsLoaded(true);
      setReport(next);
    } catch {
      if (readId === latestRead.current) {
        setProblem({ kind: "unreachable" });
      }
    }
  }, [url]);

  useEffect(() => {
    readFeed();

    const unsubscribe = subscribe?.(() => readFeed());

    const pollId = setInterval(() => readFeed(), DIAGNOSTICS_POLL_MS);

    return () => {
      unsubscribe?.();
      clearInterval(pollId);
    };
  }, [readFeed, subscribe]);

  const clear = useCallback(() => {
    // Void any read in flight, drop the entries locally, and tell the server —
    // the DELETE empties every reader's buffer, this one included. Reads issued
    // while it is in flight wait for it (see `readFeed`).
    latestRead.current += 1;
    setReport((current) => (current ? { ...current, entries: [] } : current));

    const request: Promise<void> = fetch(url, { method: "DELETE" })
      .then(() => undefined)
      .catch(() => setProblem({ kind: "unreachable" }))
      .finally(() => {
        if (pendingClear.current === request) {
          pendingClear.current = null;
        }
      });

    pendingClear.current = request;
  }, [url]);

  return {
    entries: report?.entries ?? EMPTY_ENTRIES,
    connection: report?.connection ?? null,
    manifest: report?.manifest ?? null,
    clients: report?.clients ?? 0,
    lastReportAt: report?.lastReportAt ?? null,
    lastRebuildAt: report?.lastRebuildAt ?? null,
    problem,
    loaded: isLoaded,
    clear,
  };
};
