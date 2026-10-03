# visualizer-snowplow-tracking

Source: `e2e/test/scenarios/dashboard/visualizer/snowplow-tracking.cy.spec.ts` (186 lines, 1 test)
Target: `e2e-playwright/tests/visualizer-snowplow-tracking.spec.ts`
New helpers: `support/visualizer-snowplow-tracking.ts`

## The headline: the browser-boundary snowplow capture held up on a second, unrelated spec

This is the third consumer of `support/search-snowplow.ts installSnowplowCapture`
(after `search-snowplow` and `data-studio-metrics`), and the first one outside the
search/metrics surface. It worked **first try, with zero modification** — no edits
to `search-snowplow.ts`, no new decode paths, no per-spec workarounds.

All **14** `expectUnstructuredSnowplowEvent` assertions in this spec matched on the
first run, including:

- the two-part matcher shape (`event` + `event_detail` + `triggered_from`), which
  `search-snowplow` never exercised (it mostly matches `event` + a few scalars);
- a **count assertion** (`…datasource_removed`, count `2`), i.e. the capture's
  ordering/accumulation semantics are correct across a long single test, not just
  "did an event of this shape ever arrive";
- events emitted from three different surfaces (dashboard question-list, the
  visualizer modal, the tabular-preview modal).

Evidence value: the technique's viability was previously supported by one spec
whose author also wrote the helper. This is an independent replication by a
different agent on a different feature area. I'd now treat it as the default
approach for snowplow-subject specs rather than an experiment.

Two capture-specific notes worth recording:

- **The slot backend's leaked snowplow env is a non-issue for this technique.**
  PORTING warns that a kept slot backend can carry `MB_SNOWPLOW_URL` /
  `MB_SNOWPLOW_AVAILABLE` in its process env, where env beats the app DB and the
  settings API silently refuses writes. Slot 1's backend did exactly that
  (`MB_SNOWPLOW_URL=http://localhost:9090`, `MB_SNOWPLOW_AVAILABLE=true`,
  confirmed via `ps eww` and `GET /api/session/properties`). It did **not** need
  a reboot: the capture overrides `snowplow-url` client-side in both
  `window.MetabaseBootstrap` and the routed `/api/session/properties`, so the
  backend's value never reaches the tracker. The warning applies to ports that
  try to configure snowplow through the *settings API*; it does not apply to the
  capture technique. Worth adding that qualifier to PORTING.
- `H.enableTracking()` (which is just
  `updateSetting("anon-tracking-enabled", true)`) needs no port at all for the
  same reason — the capture already forces it on.

## Known gap, stated explicitly

This spec does **not** call `expectNoBadSnowplowEvents`, so the documented Iglu
schema-validation gap is not exercised here. No claim either way about schema
conformance of the visualizer events — the port asserts payload *shape*, exactly
as `H.expectUnstructuredSnowplowEvent` does upstream, and nothing about whether
those payloads would pass micro's schema validation.

## Dividends

None. The upstream test's assertions are all real (every `cy.log` is followed by
a genuine event assertion), the helper surface it uses was already ported
faithfully by the earlier visualizer specs, and nothing about the app looked
wrong.

One near-miss worth writing down as a *negative* result, because it is the kind
of thing that gets mis-filed as a dividend:

- I added an extra `expect(modal(page)).toHaveCount(0)` after
  `closeDashcardVisualizerModal()`, reasoning that "close" should close. It
  failed with 2 dialogs. The second is **"Are you sure you want to leave?"** —
  the visualizer modal stays mounted behind a leave-confirmation because the
  dashcard has unsaved changes at that point. That is correct app behaviour, and
  upstream deliberately asserts nothing there. The assertion was over-reach on my
  part, not a finding; I removed it and left a comment explaining why the absence
  is intentional, so the next reader doesn't "fix" it back in.

## Port notes (fidelity decisions)

- **`H.deselectDataset`'s trailing `cy.wait("@cardQuery")` enforces nothing.**
  Deselecting a dataset fetches nothing; the alias is satisfied *retroactively*
  by an earlier card query (cy.wait consumes past responses — in the upstream
  ordering the whole `@cardQuery` queue is shifted by one, starting from the
  query that `clickVisualizeAnotherWay` fires). A literal `waitForResponse` port
  would have hung for the full action timeout. Ported as the settle signal that
  actually means something: the swap button flipping back to
  `aria-pressed="false"`. Another instance of the existing PORTING rule "a
  `cy.wait` that follows a no-op action may be enforcing nothing".
- `H.removeDataSource(name, { throughMenu: true })` had never been ported —
  `visualizer-basics.ts` only carries the default (direct "Remove" button)
  branch. Added `removeDataSourceThroughMenu`, reusing the hover target that
  `resetDataSourceButton` already established (hover the source-name text in the
  header row, not the list-item centre, because the ellipsis is
  `visibility: hidden` until the header is hovered).
- The `H.modal().within(…)` block wrapping most of the test is scope-only; the
  ported `visualizer-basics` helpers are already modal-scoped or page-scoped
  equivalently, so it needed no structural equivalent.
- Dropped the never-awaited `@dataset` / `@dashcardQuery` intercepts (rule 2).
  `@cardQuery` is awaited only from inside `H.selectDataset`, and the ported
  `selectDataset` registers that wait itself. The
  `GET /api/setting/version-info → {}` stub is real and is ported as a route.
- Kept the `ACCOUNTS_COUNT_BY_CREATED_AT` question creation even though the test
  never uses it — faithfulness; it changes the normal user's collection contents
  and therefore the question-list the test picks from.
- Question creation happens **after** `signInAsNormalUser`, matching upstream, so
  the four questions are owned by the normal user (the PORTING "sessions and
  auth" caveat about creator attribution).

## Consolidation candidates

- `support/visualizer-snowplow-tracking.ts` is a **fourth** file in the visualizer
  helper surface (basics / cartesian / columns-mapping / this). Per the brief I
  did not add a fifth split — everything reusable is imported from
  `visualizer-basics.ts` and only the four genuinely-new helpers live here. When
  the flagged `support/visualizer.ts` unification happens,
  `deselectDataset` / `removeDataSourceThroughMenu` /
  `toggleVisualizerSettingsSidebar` / `closeDashcardVisualizerModal` and the
  `ACCOUNTS_COUNT_BY_CREATED_AT` fixture should fold straight in — Cypress has
  exactly one copy of each, so consolidating stays faithful.
- `removeDataSourceThroughMenu` and `resetDataSourceButton` (visualizer-basics)
  share their entire menu-opening preamble; the unified module should factor out
  one `openDatasourceActionsMenu(page, name)`.
