# question-analytics (question/question-analytics.cy.spec.js)

1 test, executed, 2/2 under `--repeat-each=2`. Jar 751c2a98.
**New support module: none.**

## Snowplow CAPTURED, not stubbed — rule 6's no-op stub would have made this a no-op
Every assertion in this spec is a snowplow assertion, so
`installSnowplowCapture` (`support/search-snowplow.ts`) was used, unmodified.
This makes it the **eighth** spec to reuse that helper with zero changes,
including the mid-test `capture.reset()` path (the port of `H.resetSnowplow()`),
which no earlier spec had exercised.

Gap carried forward as usual: `expectNoBadSnowplowEvents` degrades to the
structural check (no Iglu schema validation without micro).

## `capture.reset()` verified to be a pure array clear
Probed directly rather than assumed: calling `snowplow.reset()` *before* the
first render still lets the first `chart_generated` assertion pass. So reset
does not disturb the `page.route` collector, and a post-reset empty capture
genuinely means "no events fired". Useful because the second half of this test
is an absence assertion sitting immediately after a reset.

## The "should not track again" half needed an anchor Cypress never had
The FE gates the event on the **backend** setting `non-table-chart-generated`
(`setDidFirstNonTableChartRender`, `query_builder/actions/ui.ts:51`), so the
second render legitimately fires nothing — measured: the post-reset capture is
`[]`, not merely "no matching event".

That means the absence assertion has no positive snowplow signal to lean on, so
it is anchored on the **chart having rendered** (an added
`query-visualization-root` + `svg` visibility gate inside the shared
`generateNonTableVisualization`). Without it, "no `chart_generated` event" would
be satisfied by "the page never got as far as a chart". The anchor is not
decorative — the mutation below kills on it.

## Mutation results
| mutation | outcome |
|---|---|
| drop the sidebar `"Quantity"` click (result is a scalar, not a bar chart) | KILLED at the added `svg` render anchor |
| `updateSetting("non-table-chart-generated", false)` between the two runs | **SURVIVED — and the mutation itself is a no-op**, see below |

## A backend setting whose setter silently refuses your write
`non-table-chart-generated` is declared with
`:setter #'-non-table-chart-generated!` (`src/metabase/analytics/settings.clj:97`),
which only ever applies `true`:

```clojure
(defn- -non-table-chart-generated! [new-value]
  ;; Only allow toggling from false -> true one time
  (when (true? new-value)
    (setting/set-value-of-type! :boolean :non-table-chart-generated true)))
```

So `PUT /api/setting/non-table-chart-generated {value: false}` returns 2xx and
changes nothing. A mutation built on it looks like a surviving mutant — i.e. it
reads as "the absence assertion is vacuous" — when in fact the mutation never
happened. **Generalises: a 2xx from `PUT /api/setting/:key` is not evidence the
setting changed.** Custom `:setter`s can no-op silently, the same way
`MB_SITE_URL` env-beats-appdb silently defeats site-url writes (PORTING, wave 9
slot 1). Read the `defsetting` before trusting a setting write as a mutation
lever, and cross-check with `GET /api/setting/:key`.
