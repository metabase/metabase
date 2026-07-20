/**
 * Playwright port of e2e/test/scenarios/stats/instance-stats-snowplow.cy.spec.js
 *
 * BOTH TESTS ARE `test.fixme`. This is a harness capability gap, not a product
 * bug and not port drift. Read the analysis before touching them.
 *
 * Why the browser-boundary capture cannot work here
 * -------------------------------------------------
 * Every other ported snowplow-subject spec (`search-snowplow`,
 * `visualizer-snowplow-tracking`, `data-studio-metrics`, `reference-databases`,
 * `security-center-snowplow`) asserts an event the *frontend* emits, so
 * `installSnowplowCapture` can record the tracker's POST at the browser
 * boundary. `instance_stats` is different: it is emitted by the **backend**.
 *
 *   src/metabase/analytics/stats.clj:1054
 *     (analytics.event/track-event! :snowplow/instance_stats snowplow-data)
 *   src/metabase/analytics/snowplow.clj
 *     track-event! → .track on a Java `Tracker` → Apache HttpClient POST to
 *     `(analytics.settings/snowplow-url)`
 *
 * `POST /api/testing/stats` (`testing_api/api.clj:231` → `phone-home-stats!`)
 * therefore produces an HTTP POST **from the JVM**, which never passes through
 * the browser and cannot be intercepted by `page.route`.
 *
 * Measured, not inferred (2026-07-20, slot 4105, jar 751c2a98): a plain node
 * HTTP server bound on the collector port received, ~1s after
 * `POST /api/testing/stats` returned 200, one
 * `POST /com.snowplowanalytics.snowplow/tp2` whose base64url `ue_px` decodes to
 * `iglu:com.metabase/instance_stats/jsonschema/2-0-0`. The browser made no such
 * request. So the event is real and correct — we simply have no seam to observe
 * it from.
 *
 * Why we cannot just point the collector at a test-owned server
 * ------------------------------------------------------------
 * `snowplow.clj` creates the tracker in a `defonce`, and `network-config`
 * reads `snowplow-url` at that moment:
 *
 *   (defonce ^:private tracker (Snowplow/createTracker ... (network-config) ...))
 *
 * The collector URL is therefore **fixed at backend boot**. Writing the
 * `snowplow-url` setting from a test has no effect on where events go, so the
 * usual "stand up a local collector and re-point the client" trick — the one
 * `installSnowplowCapture` uses for the FE — is unavailable.
 *
 * The one thing that *would* work is a harness change: boot each slot backend
 * with `MB_SNOWPLOW_URL=http://localhost:<per-slot collector port>` and have
 * the spec bind that port. That means editing `support/worker-backend.ts`, a
 * shared module this port is not allowed to touch, so it is written up as a
 * follow-up (findings-inbox/instance-stats-snowplow.md) rather than done here.
 * Binding the collector port from inside the spec without the harness change is
 * NOT an option: the port is global, five slots share the box, and on a clean
 * backend (and in CI) `snowplow-url` is not a localhost URL at all — the jar's
 * default is `https://sp.metabase.com`. A spec that silently skips whenever the
 * env var happens to be absent is the "green run that never executed" failure
 * shape from FINDINGS #49.
 *
 * Why upstream passes: snowplow-micro IS such an external collector, running at
 * the boot-fixed `http://localhost:9090`, and Cypress polls its `/micro/good`
 * store over HTTP. The Cypress spec is not doing anything Playwright can't do;
 * it depends on a container at a URL the backend was booted against. PORTING
 * deliberately rejected micro for the ports (one global store that
 * `resetSnowplow` wipes, shared by every parallel slot) — that trade is right
 * for FE-emitted events and is exactly what leaves this spec stranded.
 *
 * Scope of what was NOT verified: the Cypress original was not run, because the
 * probe above already establishes the only fact in dispute (where the event
 * goes). No claim is made here about the app's behaviour — the event fires,
 * with the right schema.
 *
 * Other port notes, for whoever un-fixmes this:
 * - Upstream's first test is `@OSS`-tagged, so on the spike's EE jar it would
 *   gate-skip via `isOssBackend` (PORTING wave-5 gotcha). The second is
 *   untagged and runs. The two test bodies are otherwise identical.
 * - `H.expectSnowplowEvent({ event: { event_name: "instance_stats" } })` matches
 *   against micro's enriched record, NOT the unstruct payload — it is
 *   `expectSnowplowEvent`, not `expectUnstructuredSnowplowEvent`. Any
 *   collector-side port must therefore assert on the derived `event_name`
 *   (or, equivalently, the `iglu:com.metabase/instance_stats/...` schema URI in
 *   the raw payload) rather than on `data.data`.
 * - `H.expectNoBadSnowplowEvents()` is micro's Iglu schema validation, which
 *   `support/search-snowplow.ts` can only degrade to a structural check. A
 *   collector-side port has the same gap.
 */
import { test } from "../support/fixtures";

test.describe("scenarios > stats > snowplow", () => {
  test.fixme(
    "should send a snowplow event when the stats ping is triggered on OSS",
    async () => {
      // Upstream: @OSS-tagged. See header — backend-emitted event, unobservable
      // from the browser with the current harness.
    },
  );

  test.fixme(
    "should send a snowplow event when the stats ping is triggered on EE",
    async () => {
      // See header — backend-emitted event, unobservable from the browser with
      // the current harness.
    },
  );
});
