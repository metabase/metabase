/**
 * Snowplow capture helpers for the search-snowplow spec port
 * (e2e/test/scenarios/search/search-snowplow.cy.spec.js).
 *
 * PORTING rule 6 says "snowplow helpers → no-op stubs". That rule exists so a
 * spec whose *subject* is some other feature doesn't need a snowplow-micro
 * container. It cannot apply here: every assertion in this spec is a snowplow
 * assertion, so stubbing them would port 26 tests as 26 no-ops. Instead this
 * module captures the events at the browser boundary, which needs no container
 * and no shared-file edits:
 *
 *  1. `page.addInitScript` intercepts the assignment of `window.MetabaseBootstrap`
 *     (the inline settings blob the backend embeds in index.html, which
 *     `metabase/utils/settings.ts` clones at module init) and forces
 *     `snowplow-enabled` / `anon-tracking-enabled` on, with `snowplow-url`
 *     pointed at the app's OWN origin. `/api/session/properties` is routed and
 *     patched the same way, because `trackSchemaEvent` re-reads
 *     `Settings.snowplowEnabled()` on every event and a later site-settings
 *     refresh would otherwise put the backend's value back.
 *  2. `page.route` catches the tracker's POST to
 *     `/com.snowplowanalytics.snowplow/tp2`, decodes the self-describing
 *     events out of the payload, and fulfils a 200.
 *
 * Why the app's own origin: the snowplow browser tracker POSTs
 * `application/json` plus an `SP-Anonymous` header, so a cross-origin collector
 * (the real default, `http://localhost:9090` in dev / `https://sp.metabase.com`
 * in the jar) triggers a CORS preflight — and Playwright does not intercept
 * preflights, so the real POST would never be sent and the body never observed.
 * Same-origin sidesteps CORS entirely.
 *
 * What this verifies vs. what upstream verifies
 * ---------------------------------------------
 * Same: the full FE path — the search surface calls `trackSchemaEvent`, the
 * real snowplow tracker serialises it, and the exact payload the collector
 * would receive is asserted.
 * NOT the same: snowplow-micro validates each payload against the Iglu schemas
 * in `snowplow/iglu-client-embedded`, which is what `expectNoBadSnowplowEvents`
 * really tests. We cannot do that here, so `expectNoBadSnowplowEvents` is
 * downgraded to a structural check (every captured payload decoded to a
 * well-formed self-describing event). That is an explicit, recorded gap — see
 * findings-inbox/search-snowplow.md.
 *
 * New module per PORTING rule 9; imports from shared support modules are
 * read-only.
 */
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  commandPalette,
  commandPaletteButton,
  commandPaletteInput,
} from "./command-palette";

const COLLECTOR_PATH = "/com.snowplowanalytics.snowplow/tp2";
const SESSION_PROPERTIES_PATH = "/api/session/properties";

/** The decoded `data.data` of a self-describing (unstruct) snowplow event —
 * the same object micro exposes at `event.unstruct_event.data.data`, which is
 * what H.expectUnstructuredSnowplowEvent matches against. */
export type SnowplowEventData = Record<string, unknown>;

export type SnowplowMatcher =
  | SnowplowEventData
  | ((event: SnowplowEventData) => boolean);

export class SnowplowCapture {
  /** Decoded self-describing events, oldest first. */
  events: SnowplowEventData[] = [];
  /** Payloads that could not be decoded — the `expectNoBadSnowplowEvents` proxy. */
  malformed: string[] = [];

  /** Port of H.resetSnowplow (micro/reset). */
  reset() {
    this.events = [];
    this.malformed = [];
  }

  record(postData: string | null) {
    if (postData == null) {
      this.malformed.push("<empty body>");
      return;
    }
    let payload: { data?: unknown };
    try {
      payload = JSON.parse(postData);
    } catch {
      this.malformed.push(postData.slice(0, 512));
      return;
    }
    const entries = Array.isArray(payload.data) ? payload.data : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        this.malformed.push(JSON.stringify(entry).slice(0, 512));
        continue;
      }
      const record = entry as Record<string, unknown>;
      // Only self-describing ("ue") events carry a schema'd body; page views
      // and structured events are irrelevant to this spec but must still be
      // well formed, which JSON.parse above already established.
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
        this.events.push(outer.data.data);
      } catch {
        this.malformed.push(serialized.slice(0, 512));
      }
    }
  }
}

/** `ue_pr` is a plain JSON string; `ue_px` is the same JSON base64url-encoded
 * (the tracker's `encodeBase64` default). */
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

/**
 * Install the capture on a page. Must run before the first navigation, since
 * the tracker is created during app bootstrap (`metabase/app.js _init`).
 *
 * @param collectorOrigin the app's own origin (`mb.baseUrl`).
 */
export async function installSnowplowCapture(
  page: Page,
  collectorOrigin: string,
): Promise<SnowplowCapture> {
  const capture = new SnowplowCapture();

  await page.addInitScript((origin: string) => {
    const overrides = {
      "anon-tracking-enabled": true,
      "snowplow-enabled": true,
      "snowplow-url": origin,
    };
    let value: Record<string, unknown> | undefined;
    Object.defineProperty(window, "MetabaseBootstrap", {
      configurable: true,
      get: () => value,
      set: (next) => {
        value = next == null ? next : { ...next, ...overrides };
      },
    });
  }, collectorOrigin);

  await page.route(
    (url) => url.pathname === SESSION_PROPERTIES_PATH,
    async (route) => {
      const request = route.request();
      // Native fetch rather than route.fetch(): the latter chokes on the
      // backend's set-cookie headers under bun (same reason support/search.ts
      // proxies with fetch).
      const response = await fetch(request.url(), {
        method: request.method(),
        headers: await request.allHeaders(),
        redirect: "manual",
      });
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify({
          ...body,
          "anon-tracking-enabled": true,
          "snowplow-enabled": true,
          "snowplow-url": collectorOrigin,
        }),
      });
    },
  );

  await page.route(
    (url) => url.pathname === COLLECTOR_PATH,
    async (route) => {
      capture.record(route.request().postData());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    },
  );

  return capture;
}

/**
 * Port of the `isDeepMatch` in e2e/support/helpers/e2e-snowplow-helpers.js,
 * with ONE deliberate deviation: arrays must match in length as well as
 * element-wise.
 *
 * Upstream's `isArrayDeepMatch` iterates the *expected* array's indices only,
 * so `[]` matches any array at all. That makes the type-filter "removed from
 * the UI" assertion (`content_type: []`) vacuous — it is satisfied by the
 * earlier `content_type: ["card"]` event, and the post-removal event (whose
 * real value is `null`, since `toSnowplowContentTypes(undefined)` returns
 * `null`) never matches anything. The port asserts `content_type: null` there
 * instead, which is the assertion upstream meant to make; the length check
 * keeps the remaining array assertions honest.
 */
export function isDeepMatch(
  actual: unknown,
  expected: unknown,
): boolean {
  if (typeof expected === "function") {
    return (expected as (value: unknown) => boolean)(actual);
  }

  const bothAreNotObjects =
    actual == null ||
    expected == null ||
    typeof actual !== "object" ||
    typeof expected !== "object";

  if (bothAreNotObjects) {
    return actual === expected;
  }

  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => isDeepMatch(actual[index], item))
    );
  }

  return Object.entries(expected as Record<string, unknown>).every(
    ([key, value]) =>
      isDeepMatch((actual as Record<string, unknown>)[key], value),
  );
}

/**
 * Port of H.expectUnstructuredSnowplowEvent(eventData, count). Upstream polls
 * micro for 1s; `expect.poll` here so a slow tracker POST can't flake.
 */
export async function expectUnstructuredSnowplowEvent(
  capture: SnowplowCapture,
  eventData: SnowplowMatcher,
  count = 1,
) {
  await expect
    .poll(
      () =>
        capture.events.filter((event) => isDeepMatch(event, eventData)).length,
      {
        timeout: 15_000,
        message: `expected ${count} snowplow event(s) matching ${describe(eventData)}; captured: ${JSON.stringify(capture.events).slice(0, 1024)}`,
      },
    )
    .toBe(count);
}

/** Port of H.assertNoUnstructuredSnowplowEvent. */
export function assertNoUnstructuredSnowplowEvent(
  capture: SnowplowCapture,
  eventData: SnowplowMatcher,
) {
  return expectUnstructuredSnowplowEvent(capture, eventData, 0);
}

/**
 * Structural stand-in for H.expectNoBadSnowplowEvents. Upstream asks
 * snowplow-micro for schema-validation failures; without micro we can only
 * assert every payload decoded into a well-formed self-describing event.
 */
export function expectNoBadSnowplowEvents(capture: SnowplowCapture) {
  expect(capture.malformed).toEqual([]);
}

function describe(eventData: SnowplowMatcher): string {
  return typeof eventData === "function"
    ? "<predicate>"
    : JSON.stringify(eventData);
}

/**
 * Port of H.commandPaletteSearch(query, viewAll). The shared ports of this
 * helper (search-pagination.ts, metrics-search.ts, …) all hardcode
 * `viewAll = true`; this spec needs `false`, so the variant lives here.
 */
export async function commandPaletteSearch(
  page: Page,
  query: string,
  viewAll = true,
) {
  await commandPaletteButton(page).click();
  const search = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/search" &&
      url.searchParams.has("q")
    );
  });
  await commandPaletteInput(page).fill("");
  await commandPaletteInput(page).pressSequentially(query);
  await search;

  if (viewAll) {
    await commandPalette(page)
      .getByRole("link", { name: /View and filter/ })
      .click();
  }
}
