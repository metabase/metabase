/**
 * Canonical snowplow assertions, backed by the per-slot collector.
 *
 * This replaces the per-spec no-op stubs that porting rule 6 allowed while the
 * harness had no collector ("snowplow helpers → no-op stubs"). The harness has
 * had one since `support/snowplow-collector.ts` landed: every slot backend
 * boots with `MB_SNOWPLOW_URL` pointed at its own in-process collector, which
 * therefore sees BOTH event classes —
 *
 *  - backend-emitted (`analytics/snowplow.clj track-event!`): the JVM POSTs
 *    straight to the collector;
 *  - frontend-emitted (`trackSchemaEvent`): the backend advertises the
 *    collector in `snowplow-url`, so the browser tracker POSTs to it
 *    cross-origin (the collector answers the CORS preflight, including the
 *    credentialed-request handshake — measured, see snowplow-collector.ts).
 *
 * The one switch a spec must flip is `anon-tracking-enabled` (`enableTracking`
 * below, the exact port of upstream's): `snowplow-enabled` is a derived
 * setting — `(and (snowplow-available) (anon-tracking-enabled))` — and
 * `snowplow-available` defaults to `config/is-prod?`, which is true on the
 * uberjar the suite verifies against.
 *
 * API mirrors `e2e/support/helpers/e2e-snowplow-helpers.js` name-for-name,
 * with `mb` threaded as the first argument (the stubs took none; the real
 * thing needs this worker's collector and API context).
 *
 * `expectNoBadSnowplowEvents` here is STRONGER than the browser-boundary
 * variant in support/search-snowplow.ts: it Iglu-validates every captured
 * payload against the schemas vendored in snowplow/iglu-client-embedded —
 * the same check snowplow-micro performs for upstream.
 */
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import type { SnowplowMatcher } from "./search-snowplow";
import { isDeepMatch } from "./search-snowplow";
import type { SnowplowCollector } from "./snowplow-collector";
import { expectNoBadCollectedSnowplowEvents } from "./snowplow-collector";

export type { SnowplowMatcher } from "./search-snowplow";

/**
 * Structural slice of MetabaseHarness (which fixtures.ts does not export —
 * same pattern as `SignInCapable` in support/impersonated.ts).
 */
export type SnowplowCapable = {
  snowplow: SnowplowCollector;
  api: MetabaseApi;
};

/** Port of H.enableTracking — `updateSetting("anon-tracking-enabled", true)`. */
export async function enableTracking(mb: SnowplowCapable) {
  await mb.api.updateSetting("anon-tracking-enabled", true);
}

/**
 * Port of H.resetSnowplow (micro/reset), scoped to this slot's collector.
 * Async for drop-in compatibility with the stubs it replaces (all call sites
 * already `await` it).
 */
export async function resetSnowplow(mb: SnowplowCapable) {
  mb.snowplow.reset();
}

/**
 * Port of H.expectUnstructuredSnowplowEvent(eventData, count).
 *
 * Matches the decoded `data.data` of each self-describing event — the same
 * object upstream matches at `event.unstruct_event.data.data` — with the
 * shared `isDeepMatch` (partial-object semantics; arrays additionally must
 * match in length, see the note in support/search-snowplow.ts).
 *
 * Polls rather than sampling once: the FE tracker and the backend's Java
 * tracker both POST asynchronously after the action that emits the event.
 */
export async function expectUnstructuredSnowplowEvent(
  mb: SnowplowCapable,
  eventData: SnowplowMatcher,
  count = 1,
  timeout = 15_000,
) {
  const collector = mb.snowplow;
  await expect
    .poll(
      () =>
        collector.events.filter((event) => isDeepMatch(event.data, eventData))
          .length,
      {
        timeout,
        message:
          `expected ${count} snowplow event(s) matching ${describeMatcher(eventData)}; ` +
          `captured: ${JSON.stringify(collector.events.map((e) => e.data)).slice(0, 1024)}`,
      },
    )
    .toBe(count);
}

/**
 * Port of H.assertNoUnstructuredSnowplowEvent. Same caveat as upstream: an
 * absence poll is satisfied immediately, so it only catches an event that has
 * already arrived — pair it with a positive assertion on a later event when
 * the ordering matters, as the originals do.
 */
export function assertNoUnstructuredSnowplowEvent(
  mb: SnowplowCapable,
  eventData: SnowplowMatcher,
) {
  return expectUnstructuredSnowplowEvent(mb, eventData, 0);
}

/**
 * Port of H.expectNoBadSnowplowEvents — the real one: structural decode check
 * plus Iglu schema validation of every captured event (what micro does).
 * Async for drop-in compatibility with the stubs it replaces.
 */
export async function expectNoBadSnowplowEvents(mb: SnowplowCapable) {
  expectNoBadCollectedSnowplowEvents(mb.snowplow);
}

function describeMatcher(eventData: SnowplowMatcher): string {
  return typeof eventData === "function"
    ? "<predicate>"
    : JSON.stringify(eventData);
}
