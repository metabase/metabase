# timelines-collection snowplow: page_view events not observable

Converting the snowplow no-op stubs in `tests/timelines-collection.spec.ts` to
real assertions surfaced a harness limitation.

## What upstream asserts

`e2e/test/scenarios/organization/timelines-collection.cy.spec.js`
("should send snowplow events when creating a timeline event") asserts FIVE
events via `H.expectSnowplowEvent` (the low-level raw-event matcher):

1. `page_view` `/collection/root`
2. `page_view` `/collection/root/timelines`
3. `page_view` `/collection/root/timelines/new/events/new`
4. the self-describing `new_event_created` event
5. `page_view` `/collection/root/timelines` (count 2)

## What our harness can observe

The per-slot collector (`support/snowplow-collector.ts`) records only
self-describing (`e === "ue"`) events — see the explicit
`if (record.e !== "ue") continue;` in `record()`. Snowplow page-view payloads
arrive as `e === "pv"` structured events and are intentionally dropped (they are
checked for well-formedness for `expectNoBadSnowplowEvents`, but never stored in
`collector.events`). The canonical `support/snowplow.ts` API exposes no
page-view matcher (upstream's `H.expectSnowplowEvent` raw matcher was not
ported), so assertions 1–3 and 5 are not expressible here.

## Resolution

The port keeps the one observable, meaningful assertion —
`expectUnstructuredSnowplowEvent(mb, { event: "new_event_created" })` — as a
real, mutation-verified check (mutating the event name turns the test red). The
four `page_view` assertions were dropped with an inline comment pointing here.
The test runs green and is not fixme'd.

If page-view coverage is wanted later, the collector would need to store `pv`
entries and the canonical module would need an `expectSnowplowEvent`-style raw
matcher — both are shared-support changes out of scope for this pass.
