import { useCallback, useEffect, useRef, useState } from "react";

import {
  DATA_APP_DIAGNOSTICS_URL,
  START_EVENT_ID_PARAM,
} from "../constants/diagnostics-channel";
import { DIAGNOSTICS_POLL_MS } from "../constants/timings";
import type {
  DataAppDiagnosticPayload,
  DataAppDiagnosticsReport,
  DevConnectionStatus,
} from "../types/diagnostics-channel";
import type { DataAppManifestStatus } from "../types/manifest-status";

import { capDiagnosticEntries } from "./diagnostics-limits";

/** Registers a listener for "the feed changed", returning its teardown. */
export type SubscribeToChanges = (onChange: () => void) => () => void;

export type DiagnosticsFeedProblem =
  | { kind: "unreachable" }
  | { kind: "http"; status: number };

export interface DiagnosticsFeed {
  entries: DataAppDiagnosticPayload[];
  connection: DevConnectionStatus | null;
  manifest: DataAppManifestStatus | null;
  clients: number;
  lastReportAt: number | null;
  lastRebuildAt: number | null;
  problem: DiagnosticsFeedProblem | null;
  loaded: boolean;
  clear: () => void;
}

const EMPTY_ENTRIES: DataAppDiagnosticPayload[] = [];

export const useDiagnosticsFeed = (
  url: string = DATA_APP_DIAGNOSTICS_URL,
  pollMs: number = DIAGNOSTICS_POLL_MS,
  subscribe?: SubscribeToChanges,
): DiagnosticsFeed => {
  const [entries, setEntries] =
    useState<DataAppDiagnosticPayload[]>(EMPTY_ENTRIES);
  const [report, setReport] = useState<DataAppDiagnosticsReport | null>(null);
  const [problem, setProblem] = useState<DiagnosticsFeedProblem | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Changing startEventId must not trigger a re-render or the poll loops, so useRef.
  const startEventId = useRef(0);
  // A poll can outlive its tick (a rebuild blocks the server for seconds).
  // Without this, overlapping reads share a cursor and append the same batch twice.
  const inFlight = useRef(false);
  const generation = useRef(0);
  const sessionId = useRef<string | null>(null);

  const poll = useCallback(async () => {
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;

    const polledGeneration = generation.current;

    try {
      const response = await fetch(
        `${url}?${START_EVENT_ID_PARAM}=${startEventId.current}`,
      );

      if (!response.ok) {
        setProblem({ kind: "http", status: response.status });
        return;
      }

      // `json()` returns `any`
      const next = (await response.json()) as DataAppDiagnosticsReport;

      if (polledGeneration !== generation.current) {
        return;
      }

      setProblem(null);
      setIsLoaded(true);
      setReport(next);

      if (next.sessionId !== null && next.sessionId !== sessionId.current) {
        if (sessionId.current !== null) {
          startEventId.current = 0;
          setEntries(EMPTY_ENTRIES);
        }
        sessionId.current = next.sessionId;
      }

      // A restarted dev server begins its ids at 1 again. Without this the cursor
      // stays above every new id and the panel looks healthy but stays empty.
      // Accumulated entries belong to the old server and would collide on id.
      if (next.nextEventId < startEventId.current) {
        startEventId.current = 0;
        setEntries(EMPTY_ENTRIES);
      }

      if (next.entries.length > 0) {
        startEventId.current = next.nextEventId;
        setEntries((current) =>
          capDiagnosticEntries([...current, ...next.entries]),
        );
      }
    } catch {
      setProblem({ kind: "unreachable" });
    } finally {
      inFlight.current = false;
    }
  }, [url]);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), pollMs);
    const unsubscribe = subscribe?.(() => void poll());

    return () => {
      clearInterval(timer);
      unsubscribe?.();
    };
  }, [poll, pollMs, subscribe]);

  const clear = useCallback(() => {
    generation.current += 1;
    setEntries(EMPTY_ENTRIES);
    startEventId.current = 0;

    void fetch(url, { method: "DELETE" }).catch(() =>
      setProblem({ kind: "unreachable" }),
    );
  }, [url]);

  return {
    entries,
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
