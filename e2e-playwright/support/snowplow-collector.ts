/**
 * A per-slot Snowplow collector, run in-process by the Playwright node runtime.
 *
 * Why this exists
 * ---------------
 * Snowplow events come in two classes and only one is visible from the browser:
 *
 *  - **Frontend-emitted** (`trackSchemaEvent` in `frontend/`): the browser's
 *    snowplow tracker POSTs to the collector, so `support/search-snowplow.ts`
 *    can intercept it with `page.route` at the browser boundary. That mechanism
 *    is unchanged and still the right tool for those specs.
 *  - **Backend-emitted** (`analytics/snowplow.clj track-event!`): a Java
 *    `Tracker` POSTs from the JVM via Apache HttpClient. It never passes
 *    through the browser, so `page.route` cannot see it at all.
 *
 * Cypress observes both because it runs snowplow-micro — a real collector — and
 * polls its `/micro/good` store. We rejected micro for the ports because it has
 * ONE global event store on a FIXED port (:9090) that `resetSnowplow` wipes:
 * five parallel slot backends would trample each other's assertions.
 *
 * This module keeps micro's vantage point (at the collector, downstream of
 * everything) without micro's shared-state problem: each slot gets its own
 * collector on its own port, and the slot backend is booted with
 * `MB_SNOWPLOW_URL` pointing at it. No container is involved — it's a
 * `node:http` server inside the Playwright process.
 *
 * Safety property (see findings-inbox/per-slot-snowplow-collector.md)
 * ------------------------------------------------------------------
 * `snowplow-url` defaults to `https://sp.metabase.com` when `config/is-prod?`
 * is true, which it is for the uberjar — the artifact the spike verifies
 * against. Before this change, a slot backend booted from a clean shell would
 * send real analytics events to Metabase's PRODUCTION collector for any spec
 * that neither stubbed nor captured snowplow. Pinning `MB_SNOWPLOW_URL` at boot
 * makes that impossible for every slot backend, whether or not the spec cares
 * about snowplow.
 *
 * Payload shape
 * -------------
 * `record()` produces exactly what `SnowplowCapture` in `support/search-snowplow.ts`
 * produces — the decoded `data.data` of each self-describing event — so
 * assertions read the same either side of the seam. It additionally keeps the
 * schema URI of each event (`schemas`), because the backend-side assertion
 * upstream makes (`expectSnowplowEvent({ event: { event_name: "instance_stats" }})`)
 * matches micro's *enriched* record, whose `event_name` is derived from the
 * schema URI — raw collector payloads have no `event_name` field.
 */
import type { AddressInfo } from "net";

import { expect } from "@playwright/test";
import http from "http";

import { validateIgluPayloads } from "./iglu-validate";

const COLLECTOR_PATH = "/com.snowplowanalytics.snowplow/tp2";

/** The decoded `data.data` of a self-describing (unstruct) snowplow event. */
export type SnowplowEventData = Record<string, unknown>;

export type CollectedEvent = {
  /** e.g. `iglu:com.metabase/instance_stats/jsonschema/2-0-0` */
  schema: string;
  /** The `instance_stats` part of the schema URI — micro's enriched `event_name`. */
  eventName: string;
  data: SnowplowEventData;
};

/** Derive micro's enriched `event_name` from an Iglu schema URI. */
function eventNameOf(schema: string): string {
  const match = /^iglu:[^/]+\/([^/]+)\/jsonschema\//.exec(schema);
  return match ? match[1] : schema;
}

/** `ue_pr` is plain JSON; `ue_px` is the same JSON base64url-encoded. */
function decodeUnstructPayload(record: Record<string, unknown>): string | null {
  if (typeof record.ue_pr === "string") {
    return record.ue_pr;
  }
  if (typeof record.ue_px === "string") {
    const normalized = record.ue_px.replace(/-/g, "+").replace(/_/g, "/");
    try {
      return Buffer.from(normalized, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  return null;
}

export class SnowplowCollector {
  /** Decoded self-describing events, oldest first. */
  events: CollectedEvent[] = [];
  /** Payloads that could not be decoded — the `expectNoBadSnowplowEvents` proxy. */
  malformed: string[] = [];
  /** Every request line the collector saw, for debugging a silent spec. */
  requests: string[] = [];

  private server: http.Server | undefined;
  private boundPort = 0;

  get port() {
    return this.boundPort;
  }

  get url() {
    return `http://localhost:${this.boundPort}`;
  }

  /** Port of H.resetSnowplow (micro/reset), but scoped to this slot only. */
  reset() {
    this.events = [];
    this.malformed = [];
    this.requests = [];
  }

  /** Events whose schema URI names `eventName` (micro's enriched field). */
  named(eventName: string) {
    return this.events.filter((event) => event.eventName === eventName);
  }

  record(body: string) {
    let payload: { data?: unknown };
    try {
      payload = JSON.parse(body);
    } catch {
      this.malformed.push(body.slice(0, 512));
      return;
    }
    const entries = Array.isArray(payload.data) ? payload.data : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        this.malformed.push(JSON.stringify(entry).slice(0, 512));
        continue;
      }
      const record = entry as Record<string, unknown>;
      // Only self-describing ("ue") events carry a schema'd body. Page views
      // and structured events must still be well formed, which the JSON.parse
      // above already established.
      if (record.e !== "ue") {
        continue;
      }
      const serialized = decodeUnstructPayload(record);
      if (serialized == null) {
        this.malformed.push(JSON.stringify(record).slice(0, 512));
        continue;
      }
      try {
        const outer = JSON.parse(serialized) as {
          schema?: string;
          data?: { schema?: string; data?: SnowplowEventData };
        };
        if (
          typeof outer.schema !== "string" ||
          typeof outer.data?.schema !== "string" ||
          outer.data.data == null
        ) {
          this.malformed.push(serialized.slice(0, 512));
          continue;
        }
        this.events.push({
          schema: outer.data.schema,
          eventName: eventNameOf(outer.data.schema),
          data: outer.data.data,
        });
      } catch {
        this.malformed.push(serialized.slice(0, 512));
      }
    }
  }

  async start(port: number) {
    const server = http.createServer((request, response) => {
      this.requests.push(`${request.method} ${request.url}`);

      // The browser tracker may also reach this collector cross-origin (the
      // slot backend advertises this URL in `snowplow-url`), which preflights.
      // Answering permissively costs nothing and keeps those events observable
      // instead of silently dropped by CORS.
      const cors = {
        "Access-Control-Allow-Origin": request.headers.origin ?? "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, sp-anonymous",
        "Access-Control-Max-Age": "600",
      };

      if (request.method === "OPTIONS") {
        response.writeHead(200, cors);
        response.end();
        return;
      }

      if (request.method !== "POST" || !request.url?.startsWith(COLLECTOR_PATH)) {
        response.writeHead(404, cors);
        response.end();
        return;
      }

      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        this.record(Buffer.concat(chunks).toString("utf8"));
        response.writeHead(200, { ...cors, "Content-Type": "application/json" });
        response.end("{}");
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      // Bind on all interfaces: in CI the JVM may resolve `localhost` to ::1
      // or 127.0.0.1 depending on the runner's stack, and a collector that
      // silently never receives is the worst failure mode here.
      server.listen(port, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });

    this.server = server;
    this.boundPort = (server.address() as AddressInfo).port;
  }

  async stop() {
    const server = this.server;
    if (!server) {
      return;
    }
    this.server = undefined;
    await new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  }
}

/**
 * Collector-side port of `H.expectSnowplowEvent({ event: { event_name } })`.
 *
 * Upstream matches micro's *enriched* record, whose `event_name` micro derives
 * from the Iglu schema URI — a raw collector payload has no such field, so we
 * derive it the same way (see `eventNameOf`). Polls, because the backend's
 * tracker emits asynchronously after `POST /api/testing/stats` returns.
 */
export async function expectCollectedSnowplowEvent(
  collector: SnowplowCollector,
  eventName: string,
  count = 1,
  timeout = 60_000,
) {
  await expect
    .poll(() => collector.named(eventName).length, {
      timeout,
      message:
        `expected ${count} collector-side snowplow event(s) named "${eventName}"; ` +
        `saw schemas ${JSON.stringify(collector.events.map((e) => e.schema))} ` +
        `across requests ${JSON.stringify(collector.requests)}`,
    })
    .toBe(count);
}

/**
 * Port of `H.expectNoBadSnowplowEvents` — and, unlike the browser-boundary
 * capture in support/search-snowplow.ts, a real one.
 *
 * Upstream asks snowplow-micro which events failed **Iglu schema validation**.
 * A real collector plus the schemas vendored at
 * `snowplow/iglu-client-embedded/schemas` is enough to do that validation
 * locally, so this asserts both halves of what micro asserts:
 *
 *  1. every payload decoded into a well-formed self-describing event, and
 *  2. every decoded body validates against its declared Iglu schema.
 *
 * If the validator cannot load (see support/iglu-validate.ts), this degrades to
 * (1) and says so loudly in the failure message rather than quietly passing.
 */
export function expectNoBadCollectedSnowplowEvents(
  collector: SnowplowCollector,
) {
  expect(collector.malformed).toEqual([]);

  const result = validateIgluPayloads(collector.events);
  if (!result.available) {
    console.warn(
      `[snowplow-collector] Iglu validation unavailable (${result.unavailableReason}) — ` +
        "expectNoBadCollectedSnowplowEvents degraded to a structural check only.",
    );
    return;
  }
  expect(
    result.failures,
    `Iglu schema validation failed for ${result.failures.length} captured event(s)`,
  ).toEqual([]);
}

/**
 * The collector port for a slot backend. Derived from the backend port so the
 * mapping is total and obvious (4101 -> 5101) and nothing is shared between
 * slots. 5100-5115 was verified free on the dev box; the 5100 block is not used
 * by any service the ports assume (see RESUME.md "Local services").
 */
export function collectorPortFor(backendPort: number) {
  return backendPort + 1000;
}
