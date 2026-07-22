import type { Connect } from "vite";

import {
  DATA_APP_DIAGNOSTICS_URL,
  START_EVENT_ID_PARAM,
} from "../../constants/diagnostics-channel";
import type { DataAppDiagnosticsReport } from "../../types/diagnostics-channel";
import type { DataAppManifestStatus } from "../../types/manifest-status";
import type { DiagnosticsStore } from "../diagnostics-store";

export interface DiagnosticsEndpointMiddlewareOptions {
  store: DiagnosticsStore;
  getManifest: () => DataAppManifestStatus | null;
  getClients: () => number;
  getLastRebuildAt: () => number | null;
}

/**
 * Adds the `DATA_APP_DIAGNOSTICS_URL` endpoint to the dev server: `GET` returns
 * the feed as JSON (from `?startEventId=` onward), `DELETE` empties it.
 */
export const getDiagnosticsEndpointMiddleware =
  ({
    store,
    getManifest,
    getClients,
    getLastRebuildAt,
  }: DiagnosticsEndpointMiddlewareOptions): Connect.NextHandleFunction =>
  (req, res, next) => {
    const [pathname, query] = (req.url ?? "").split("?");

    if (pathname !== DATA_APP_DIAGNOSTICS_URL) {
      next();

      return;
    }

    // Clear diagnostics store on DELETE
    if (req.method === "DELETE") {
      store.clear();
      res.statusCode = 204;
      res.end();

      return;
    }

    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, DELETE");
      res.end();

      return;
    }

    const startEventId = Number(
      new URLSearchParams(query).get(START_EVENT_ID_PARAM),
    );

    const report: DataAppDiagnosticsReport = {
      ...store.getReport(startEventId),
      manifest: getManifest(),
      clients: getClients(),
      lastRebuildAt: getLastRebuildAt(),
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    res.end(JSON.stringify(report, null, 2));
  };
