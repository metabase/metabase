# sdk-iframe-embed-options (Group A, slot 5 / :4105)

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/embed-options.cy.spec.ts` (366 lines, 9 tests)
Target: `e2e-playwright/tests/sdk-iframe-embed-options.spec.ts`

## Result

- **8 executed and passing, 1 gate-skipped** (the `@OSS` describe — the spike
  backend is EE, so `isOssBackend` skips it; it is a port, not a run).
- Stable under `--repeat-each=2`: **16 passed / 2 skipped**, 23.4s.
- `bunx tsc --noEmit` clean.
- No `test.fixme`. **No product-bug claims. No dividends.**

Jar verified: `target/uberjar/metabase.jar`, COMMIT-ID `751c2a98`.

## Slot proof (#39)

The first full run came back green in 10.6s total, ~1.5s/test — suspicious
enough to stop and check rather than report. It holds up:

- Probed the embed iframe's `src`: `http://localhost:4105/embed/sdk/v1?…`,
  equal to `mb.baseUrl`. (`support/sdk-iframe.ts` derives all three URLs from
  `mb.baseUrl`, so this was expected — but "expected" is not "checked".)
- `curl :4000/api/health` → nothing listening. A :4000 misdirection on this box
  would have failed loudly, so this run is not the #39 shape.
- The speed is real: warm jar backend + a small embed page. Within PORTING's
  documented 1–3s/test jar-mode band.

## Mutation checks (the negative assertions are the whole spec)

This spec is mostly "option X is NOT rendered", and `should("not.exist")` is a
one-shot absent check, so a naive port is trivially green against a blank
frame. Every absence check is ported as a non-retrying
`expect(await loc.count()).toBe(0)` at the same instant the original took it,
gated behind `waitForSimpleEmbedIframesToLoad` (the block that upstream's
`getSimpleEmbedIframeContent` performed for free and the Playwright
`loadSdkIframeEmbedTestPage` deliberately does not).

Falsified, not assumed:

1. Corrupted the "the dashboard actually rendered" anchor
   (`Orders in a dashboard` → nonsense) → the EE-without-license test failed at
   41s. So the frame content assertion is load-bearing, and the Subscriptions
   absence check behind it is not vacuous.
2. Corrupted `[aria-label='download icon']` and `Pick your starting data` →
   the interactive-question and exploration-template tests failed. Frame is
   real, content is real.
3. **Vacuity probe for the toolbar-absence checks**: swapped
   `getByTestId("interactive-question-result-toolbar")` for
   `getByTestId("table-root")` at the identical instant → count is **1**. The
   question is fully painted when the toolbar is asserted absent, so
   `drills=false` is genuinely being observed, not a render race.
4. **Vacuity probe for the exploration template's "no collection picker"**:
   after the `Save` click there IS an open `role="dialog"` (count 1) — the save
   flow ran, and the absence of "Where do you want to save this?" is a real
   observation about `targetCollection`, not a click that missed.
5. EE subscriptions test: mutated `Bobby Tables` `toHaveCount(2)` → 3, got
   `Received: 2`. Both subscriptions are really created.

The spec also contains its own natural control pair, which is the strongest
evidence in the file: the *same* click on the *same* `37.65` cell yields no
"Filter by this value" under `drills=false` (tests 1, 3) and yields it under
`drills=true` (tests 4, 5, 6). A dead click would fail the positives.

## Adaptations (all environmental / harness, none product)

- **`H.setupSMTP()` → `configureSmtpSettings` (`support/admin-extras.ts`).**
  Upstream's helper PUTs `/api/email`, which live-validates the SMTP connection
  and therefore needs the maildev container (not running here, and
  `bunx maildev` installs 3.x, which per PORTING silently gate-skips email
  specs while looking green). This spec never sends or reads mail — it only
  needs Metabase to consider email *configured* so the subscription sidebar is
  reachable. `configureSmtpSettings` writes the identical settings through
  `PUT /api/setting`, which skips validation. Consequence: **all three
  subscription describes execute** rather than gate-skipping on a container.
  Verified by mutation #5 — the subscriptions really are created and rendered.
- `@getCardQuery` / `@getDashCardQuery` are aliases `H.prepareSdkIframeEmbedTest`
  registers; the Playwright harness deliberately does not (PORTING rule 2), so
  each test arms its own `waitForResponse` before the page load.
- Rule 1: every `findByText`/`findByRole(name)` string → `{ exact: true }`.
  `cy.button("Set up a new schedule")` → `getByRole("button", { name, exact })`.
- `cy.findByDisplayValue("Hourly")` → the shared `filters-repros.findByDisplayValue`
  (scans input/textarea/select), scoped to the sidebar.
- Test 4 (`interactive question, drills=true`) reorders its own steps 1 and 2:
  the download-icon *visibility* assertion is made before the card-title
  *absence* check. Same instant, and it makes the absence check non-vacuous.
  No assertion added, dropped or weakened.

## `support/sdk-iframe.ts`

Consumed **unmodified**. Nothing in this spec needed a change to it —
`metabaseConfig`, `elements`, camelCase→kebab attribute conversion and
`waitForSimpleEmbedIframesToLoad` all covered it as-is. No new
`support/sdk-iframe-embed-options.ts` module was needed either: the only two
new helpers (`waitForCardQuery`, `waitForDashCardQuery`) are 6-line
`waitForResponse` predicates local to the spec, matching the shape the auth
proof spec already uses.

## Note for whoever ports the rest of Group A

`waitForDashCardQuery` is now written identically in two specs
(`sdk-iframe-authentication`, `sdk-iframe-embed-options`) and `waitForCardQuery`
will be needed by most of the remaining 13. Cheap consolidation candidate:
fold both into `support/sdk-iframe.ts` at the next consolidation pass —
Cypress has exactly one copy of each (the aliases in
`prepareSdkIframeEmbedTest`), so consolidating stays faithful.

## 3-line summary

Ported 1:1; 8 executed green, 1 gate-skipped on `@OSS`; stable ×2; tsc clean.
The spec is almost entirely one-shot absence checks, so the work was proving
they aren't vacuous — five mutation probes, all bit where they should.
Nothing here is a product bug and nothing is a dividend.
