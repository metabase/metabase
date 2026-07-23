import type { Connect } from "vite";

import {
  DATA_APP_DIAGNOSTICS_URL,
  START_EVENT_ID_PARAM,
} from "../constants/diagnostics-channel";
import type { DataAppDiagnosticsReport } from "../types/diagnostics-channel";
import type { DataAppManifestStatus } from "../types/manifest-status";

import type { DiagnosticsStore } from "./diagnostics-store";

export interface ServeDiagnosticsOptions {
  store: DiagnosticsStore;
  getManifest: () => DataAppManifestStatus | null;
  getClients: () => number;
  getLastRebuildAt: () => number | null;
}

export const serveDiagnostics =
  ({
    store,
    getManifest,
    getClients,
    getLastRebuildAt,
  }: ServeDiagnosticsOptions): Connect.NextHandleFunction =>
  (req, res, next) => {
    const [pathname, query] = (req.url ?? "").split("?");

    if (pathname !== DATA_APP_DIAGNOSTICS_URL) {
      next();

      return;
    }

    if (req.method === "DELETE") {
      store.clear();
      res.statusCode = 204;
      res.end();

      return;
    }

    const report: DataAppDiagnosticsReport = {
      entries: store.read(
        Number(new URLSearchParams(query).get(START_EVENT_ID_PARAM)),
      ),
      connection: store.connection,
      manifest: getManifest(),
      clients: getClients(),
      lastReportAt: store.lastReportAt,
      lastRebuildAt: getLastRebuildAt(),
      nextEventId: store.nextEventId,
      sessionId: store.sessionId,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(report, null, 2));
  };
