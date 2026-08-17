import type { Connect } from "vite";

import {
  DATA_APP_DIAGNOSTICS_URL,
  INCLUDE_STALE_PARAM,
  START_EVENT_ID_PARAM,
} from "../../constants/diagnostics-channel";
import type {
  DataAppDiagnosticPayload,
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
  getBuildId: () => number;
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
 * Whether a later build has replaced the code this entry came from.
 *
 * Every save rebuilds, and a multi-step edit passes through builds that don't
 * compile or don't run, so the buffer fills with failures of code the preview
 * no longer runs. Withholding those is safe because a rebuild re-evaluates the
 * bundle and remounts the app from scratch: anything still broken is reported
 * again under the current build, and anything not reported again was fixed by
 * the edit.
 *
 * Only *older* generations count. An entry stamped ahead of the server's
 * counter comes from a page still running a bundle from before a dev-server
 * restart — nothing has replaced it, and dropping it would blind the reader to
 * a preview that is failing right now.
 */
const isSupersededByBuild = (
  entry: DataAppDiagnosticPayload,
  buildId: number,
): boolean => entry.buildId != null && entry.buildId < buildId;

// `?includeStale`, `=true` and `=1` all opt in; only an explicit false/0 does
// not — a reader who bothered to add the param meant to see everything.
const isFlagSet = (value: string | null): boolean =>
  value !== null && value !== "false" && value !== "0";

/**
 * The `DATA_APP_DIAGNOSTICS_URL` endpoint: `GET` serves the feed (from
 * `?startEventId=` onward, withholding what a later build superseded unless
 * `?includeStale` opts in — bare, `=true` or `=1`), `POST` takes the page
 * reporter's batches, `DELETE` empties the feed. Mutations broadcast a
 * changed-event so readers re-read.
 */
export const getDiagnosticsEndpointMiddleware =
  ({
    store,
    getManifest,
    getClients,
    getLastRebuildAt,
    getBuildId,
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

    const params = new URLSearchParams(query);
    const startEventId = Number(params.get(START_EVENT_ID_PARAM));
    const includeStale = isFlagSet(params.get(INCLUDE_STALE_PARAM));

    const buildId = getBuildId();
    const stored = store.getReport(startEventId);
    const entries = includeStale
      ? stored.entries
      : stored.entries.filter((entry) => !isSupersededByBuild(entry, buildId));

    const report: DataAppDiagnosticsReport = {
      ...stored,
      entries,
      staleEntries: stored.entries.length - entries.length,
      manifest: getManifest(),
      clients: getClients(),
      lastRebuildAt: getLastRebuildAt(),
      buildId,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    res.end(JSON.stringify(report, null, 2));
  };
