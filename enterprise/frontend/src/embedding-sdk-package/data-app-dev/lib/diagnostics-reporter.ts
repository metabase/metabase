import {
  getDevConnectionStatus,
  getDevDiagnostics,
  subscribeDevDiagnostics,
} from "../components/DevToolbar/diagnostics";
import { DATA_APP_DIAGNOSTICS_EVENT } from "../constants/diagnostics-channel";
import { DIAGNOSTICS_FLUSH_MS } from "../constants/timings";
import type { DataAppDiagnosticsMessage } from "../types/diagnostics-channel";

import { toPayload } from "./diagnostics-payload";

export interface DiagnosticsReporterHot {
  send: (event: string, data: DataAppDiagnosticsMessage) => void;
}

export const installDiagnosticsReporter = (
  hot: DiagnosticsReporterHot,
): (() => void) => {
  const sessionId = String(Date.now());

  let lastSentId = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;

    const fresh = getDevDiagnostics().filter((entry) => entry.id > lastSentId);

    if (fresh.length > 0) {
      lastSentId = fresh[fresh.length - 1].id;
    }

    hot.send(DATA_APP_DIAGNOSTICS_EVENT, {
      sessionId,
      entries: fresh.map(toPayload),
      connection: getDevConnectionStatus(),
    });
  };

  const schedule = () => {
    timer ??= setTimeout(flush, DIAGNOSTICS_FLUSH_MS);
  };

  flush();

  const unsubscribe = subscribeDevDiagnostics(schedule);

  return () => {
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
};
