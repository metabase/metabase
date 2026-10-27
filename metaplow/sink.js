/**
 * Recording sink for Metabase Track (Metaplow) events, used by the end-to-end suite.
 *
 * It stands in for the collector: it accepts the posts the browser tracker and the backend sender
 * make, keeps them in memory, and hands them back so a spec can assert an event actually arrived.
 * Deliberately not a collector — a real one is an application with a database and migrations, which
 * is disproportionate CI surface for asserting that a JSON body arrived. The equivalent for Snowplow
 * is the `snowplow-micro` container in `snowplow/docker-compose.yml`.
 *
 * Routes:
 *   POST <anything>    record the body and answer `{}` — a JSON object with no `disabled` flag, which
 *                      is what the tracker library needs to keep sending. Any path is recorded, not
 *                      just the collector's, so a misconfigured collector URL shows up as a wrong
 *                      `path` rather than as silence.
 *   GET  /sink/events  everything recorded since the last reset, oldest first
 *   GET  /sink/reset   drop everything recorded
 *
 * No dependencies: the container runs this file straight off a stock `node` image.
 */

const http = require("node:http");

/** Plenty for any one spec, and bounds memory across a whole e2e run that never resets. */
const DEFAULT_MAX_EVENTS = 1000;

/**
 * A real event is a few KB — the tracker truncates strings at 500 characters — and the largest thing
 * the backend sends is the daily instance-statistics payload. 1MB is well clear of both.
 */
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

const CORS_HEADERS = {
  // The app posts from a different origin (the instance) than the sink's own.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  // `x-track-cache` is the tracker library's own header; without it the browser blocks the post.
  "Access-Control-Allow-Headers": "content-type, x-track-cache",
  "Access-Control-Max-Age": "86400",
};

function respond(res, status, body) {
  const payload = JSON.stringify(body ?? {});
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Reads the whole body, or resolves `null` once it goes over `maxBodyBytes`. */
function readBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let overflowed = false;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        overflowed = true;
        // Keep draining rather than destroying the socket: the client gets a 413 instead of a
        // connection reset, which is far easier to read in a failing spec.
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () =>
      resolve(overflowed ? null : Buffer.concat(chunks).toString("utf8")),
    );
    req.on("error", reject);
  });
}

function createSink({
  maxEvents = DEFAULT_MAX_EVENTS,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
} = {}) {
  let events = [];

  const record = (path, raw) => {
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      // Left as null, with the text kept in `raw`. A body the collector could not have read is
      // itself worth seeing in a failing spec.
    }
    events.push({
      receivedAt: new Date().toISOString(),
      path,
      body,
      ...(body === null ? { raw } : {}),
    });
    if (events.length > maxEvents) {
      events = events.slice(events.length - maxEvents);
    }
  };

  return http.createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];

    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method === "GET" && path === "/sink/events") {
      respond(res, 200, events);
      return;
    }

    if (req.method === "GET" && path === "/sink/reset") {
      events = [];
      respond(res, 200, { reset: true });
      return;
    }

    if (req.method === "POST") {
      readBody(req, maxBodyBytes)
        .then((raw) => {
          if (raw === null) {
            respond(res, 413, { error: "body too large" });
            return;
          }
          record(path, raw);
          // `{}` rather than an empty body: the tracker parses the response and reads `disabled` and
          // `cache` out of it, so it has to be JSON, and it must not say `disabled`.
          respond(res, 200, {});
        })
        .catch(() => respond(res, 400, { error: "could not read body" }));
      return;
    }

    respond(res, 404, { error: "not found" });
  });
}

module.exports = { createSink };

if (require.main === module) {
  const port = Number(process.env.PORT ?? 9091);
  createSink().listen(port, () => {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- a dev container's startup log, never shown to a user
    console.log(`Metabase Track sink listening on ${port}`);
  });
}
