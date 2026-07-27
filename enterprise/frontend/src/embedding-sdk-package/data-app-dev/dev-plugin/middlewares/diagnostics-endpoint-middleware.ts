import type { Connect } from "vite";

import {
  DATA_APP_DIAGNOSTICS_URL,
  START_EVENT_ID_PARAM,
} from "../../constants/diagnostics-channel";
import type {
  DataAppDiagnosticsMessage,
  DataAppDiagnosticsReport,
} from "../../types/diagnostics-channel";
import type { DataAppManifestStatus } from "../../types/manifest-status";
import type { DiagnosticsStore } from "../diagnostics-store";

export interface DiagnosticsEndpointMiddlewareOptions {
  store: DiagnosticsStore;
  getManifest: () => DataAppManifestStatus | null;
  getClients: () => number;
  getLastRebuildAt: () => number | null;
  notifyChanged: () => void;
}

const readJsonBody = async (req: Connect.IncomingMessage): Promise<unknown> => {
  // The stream yields Buffers, but typing the array as `Uint8Array` (their
  // base class) sidesteps `Buffer.concat`'s over-narrow generic signature.
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
};

/**
 * The `DATA_APP_DIAGNOSTICS_URL` endpoint: `GET` serves the feed (from
 * `?startEventId=` onward), `POST` takes the page reporter's batches, `DELETE`
 * empties the feed. Mutations broadcast a changed-event so readers re-read.
 */
export const getDiagnosticsEndpointMiddleware =
  ({
    store,
    getManifest,
    getClients,
    getLastRebuildAt,
    notifyChanged,
  }: DiagnosticsEndpointMiddlewareOptions): Connect.NextHandleFunction =>
  async (req, res, next) => {
    const [pathname, query] = (req.url ?? "").split("?");

    if (pathname !== DATA_APP_DIAGNOSTICS_URL) {
      next();

      return;
    }

    if (req.method === "POST") {
      const message = await readJsonBody(req);

      if (typeof message !== "object" || message === null) {
        res.statusCode = 400;
        res.end();

        return;
      }

      // Field-level guarding happens in `applyMessage`; the parse above only
      // establishes that a JSON object arrived.
      if (store.applyMessage(message as DataAppDiagnosticsMessage)) {
        notifyChanged();
      }

      res.statusCode = 204;
      res.end();

      return;
    }

    // Clear diagnostics store on DELETE
    if (req.method === "DELETE") {
      store.clear();
      notifyChanged();
      res.statusCode = 204;
      res.end();

      return;
    }

    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, POST, DELETE");
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
