import { devDiagnostics } from "../components/DevToolbar/diagnostics";
import { DATA_APP_DIAGNOSTICS_EVENT } from "../constants/diagnostics-channel";
import { DIAGNOSTICS_FLUSH_MS } from "../constants/timings";
import type { DataAppDiagnosticsMessage } from "../types/diagnostics-channel";

import { toPayload } from "./diagnostics-payload";

export interface DiagnosticsReporterHot {
  send: (event: string, data: DataAppDiagnosticsMessage) => void;
}

const getNextSessionId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Mirrors the page's collector to the dev server over the HMR socket, so the
 * feed shows what the preview captured. Sends once on install to announce the
 * page, then a coalesced batch of whatever is new.
 */
export const installDiagnosticsReporter = (
  hot: DiagnosticsReporterHot,
): (() => void) => {
  const sessionId = getNextSessionId();

  let lastSentId = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;

    const fresh = devDiagnostics
      .getEntries()
      .filter((entry) => entry.id > lastSentId);

    if (fresh.length > 0) {
      lastSentId = fresh[fresh.length - 1].id;
    }

    hot.send(DATA_APP_DIAGNOSTICS_EVENT, {
      sessionId,
      entries: fresh.map(toPayload),
      connection: devDiagnostics.getConnectionStatus(),
    });
  };

  const schedule = () => {
    timer ??= setTimeout(flush, DIAGNOSTICS_FLUSH_MS);
  };

  flush();

  const unsubscribe = devDiagnostics.subscribe(schedule);

  return () => {
    unsubscribe();

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
};
