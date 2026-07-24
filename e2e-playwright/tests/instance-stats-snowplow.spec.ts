/**
 * Playwright port of e2e/test/scenarios/stats/instance-stats-snowplow.cy.spec.js
 *
 * Both tests were `test.fixme` until the per-slot collector landed. The reason
 * is worth keeping, because it generalises: snowplow events split into two
 * classes and they need two different observation seams.
 *
 *  - **Frontend-emitted** (`trackSchemaEvent` in `frontend/`): the browser's
 *    tracker POSTs to the collector, so `installSnowplowCapture`
 *    (support/search-snowplow.ts) intercepts it with `page.route`. That is what
 *    every other snowplow-subject port uses, and it is unchanged.
 *  - **Backend-emitted**: `stats.clj:1054` calls `track-event!
 *    :snowplow/instance_stats`, which `snowplow.clj` hands to a Java `Tracker`
 *    that POSTs via Apache HttpClient. It never passes through the browser, so
 *    `page.route` can see nothing at all.
 *
 * `POST /api/testing/stats` (`testing_api/api.clj` -> `phone-home-stats!`) is
 * the backend-emitted case, so this spec asserts at `mb.snowplow` — the slot's
 * own `node:http` collector, which the backend is booted pointing at
 * (`support/worker-backend.ts`, `_JAVA_OPTIONS` -> `mb.snowplow.url`). Same
 * vantage point Cypress gets from snowplow-micro, without micro's one global
 * store on one fixed port.
 *
 * Assertion shape: upstream's `H.expectSnowplowEvent({ event: { event_name:
 * "instance_stats" } })` matches micro's *enriched* record, not the unstruct
 * payload — so this asserts on the derived event name, which
 * `expectCollectedSnowplowEvent` reads back out of the Iglu schema URI exactly
 * as micro does.
 *
 * Known gap, same as the browser-side capture: `H.expectNoBadSnowplowEvents` is
 * micro's Iglu schema validation. We have no Iglu validator, so
 * `expectNoBadCollectedSnowplowEvents` is a structural check only.
 *
 * Port note: upstream's first test is `@OSS`-tagged. Playwright has no tag
 * filtering, so it probes the backend with `isOssBackend` (PORTING wave-5
 * gotcha); on the spike's EE jar it skips, and the second, untagged test runs.
 * The two bodies are otherwise identical.
 */
import { isOssBackend } from "../support/admin";
import { test } from "../support/fixtures";
import {
  expectCollectedSnowplowEvent,
  expectNoBadCollectedSnowplowEvents,
} from "../support/snowplow-collector";

test.describe("scenarios > stats > snowplow", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    // Port of H.resetSnowplow (micro/reset) — scoped to this slot's collector,
    // so parallel slots cannot wipe each other's events.
    mb.snowplow.reset();
    await mb.signInAsAdmin();
    // Port of H.enableTracking().
    await mb.api.updateSetting("anon-tracking-enabled", true);
  });

  test.afterEach(async ({ mb }) => {
    expectNoBadCollectedSnowplowEvents(mb.snowplow);
  });

  test("should send a snowplow event when the stats ping is triggered on OSS", async ({
    mb,
  }) => {
    test.skip(!(await isOssBackend(mb.api)), "upstream @OSS-tagged");
    await mb.api.post("/api/testing/stats", undefined, { timeout: 120_000 });
    await expectCollectedSnowplowEvent(mb.snowplow, "instance_stats");
  });

  test("should send a snowplow event when the stats ping is triggered on EE", async ({
    mb,
  }) => {
    await mb.api.post("/api/testing/stats", undefined, { timeout: 120_000 });
    await expectCollectedSnowplowEvent(mb.snowplow, "instance_stats");
  });
});
