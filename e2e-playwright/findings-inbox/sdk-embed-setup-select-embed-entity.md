# select-embed-entity — Group B, entity-selection step

Slot 2 (:4102), jar mode (`version.hash` = `751c2a9`, `target/uberjar/COMMIT-ID`
`751c2a98`, backend process confirmed `java -jar …/target/uberjar/metabase.jar`).

Deliverables: `tests/sdk-embed-setup-select-embed-entity.spec.ts`,
`support/sdk-embed-setup-select-embed-entity.ts` (two passive recorders, 80
lines). `bunx tsc --noEmit` clean.

**7 executed, 7 passed, 0 skipped, 0 fixme, 0 gate-skipped.** 14/14 under
`--repeat-each=2` (28.4s). Single run 15.5s.

---

## 1. Numbers and mutation check

Upstream has 7 `it`s across two describes (6 + 1); all 7 ported 1:1, none
merged, dropped or weakened. There is **no tag, no token gate and no
tier-varying describe** in this spec — its only licence interaction is
`activateToken("pro-self-hosted")` in both `beforeEach`s — so there was nothing
to `test.skip` and nothing to report as gate-skipped (FINDINGS #49 split:
7 executed / 0 gate-skipped).

**Mutation-checked: 7 assertions corrupted, one per test — a snowplow
`event_detail` (×2), the `x-metabase-embedded-preview` header value, a preview
question title, the awaited dashboard id, an iframe breadcrumb, and the x-ray
dashboard name. All 7 tests failed and no others.** Every test carries at least
one enforcing assertion.

## 2. Zero helper changes — sixth Group B spec in a row

`support/sdk-embed-setup.ts` was consumed strictly read-only and needed no
edits. Its `logRecent` (extracted during the helper session precisely because
this spec and `select-embed-experience` duplicate it) dropped in unchanged, and
this is the first spec to actually use it.

`embedPreview` (the retrying `H.getSimpleEmbedIframeContent` gate) was imported
read-only from `support/sdk-embed-setup-select-embed-options.ts` rather than
re-implemented, per the brief. **Consolidation candidate:** `embedPreview` is
now used by two specs in this tier and is a straight port of a tier-wide `H`
helper — it belongs in `support/sdk-embed-setup.ts` next to the other tier
helpers, not in a spec-local module.

## 3. The absence rule did not apply here — the spec has zero absence assertions

Worth stating plainly given the brief anticipated "full of absence checks": the
Cypress original contains **no `should("not.exist")`, no `not.be.visible`, and
no negated assertion of any kind**. Every assertion is positive (visible /
contains / event emitted), so `toHaveCount(0)` never came up and no
anchor-vs-vacuity judgement was needed. The vacuity risk in this spec is a
different shape — §5.

## 4. `cy.wait("@dashboard")` here is retroactive, and a count-based port is WRONG

Both `cy.wait("@dashboard")` sites read the alias `visitNewEmbedPage` registers,
long after the wizard has already fetched. Rule 2's armed `waitForResponse` is
the wrong shape (it would block on a *new* request), so both are ported as a
passive response recorder — same reasoning as `capturePreviewEmbedRequests` in
the guest-embed port.

My first attempt modelled it as "at least 2 dashboard responses" (reasoning:
`visitNewEmbedPage` consumes the first, so the spec's own wait needs the
second). **That is measurably wrong and it failed on the jar**: "can search and
select a dashboard" produces exactly **one** `/api/dashboard/:id` fetch for the
whole test. The recorder is now read as "the *selected* dashboard has been
fetched" (`waitForDashboardResponse(responses, id)`), which matches the intent
of upstream's own `cy.log("selected dashboard should be shown in the preview")`
and passes at both sites. Generalisable: when porting a retroactive `cy.wait`
as a recorder, key on *which* response, never on a count — the count is an
artifact of how many times the app happened to refetch.

## 5. Upstream weakness (NOT a product bug): "can search and select a dashboard" proves nothing about selecting

**Proved by inversion, not by reading**: with the entire entity-picker
interaction deleted from that test (open picker → "Our analytics" → "Acme Inc"),
the test **still passes** — `getResourceSelectorButton` already contains
"Acme Inc", the preview already shows it, and the dashboard fetch has already
happened.

Cause: the test creates "Acme Inc" in its own body and the wizard defaults to
the most-recently-*created* dashboard (that is exactly the EMB-1179 behaviour
the last test in the file asserts). So the dashboard the picker "selects" is the
one already selected, and every post-picker assertion is satisfied by the
pre-interaction state. The test also does not search — it navigates the tree.

The control that makes this sharp rather than speculative: the sibling **"can
search and select a question" is NOT vacuous** — the same probe (picker
interaction deleted) makes it fail at `toContainText`, because the default chart
selection is a different question. Same file, same shape, opposite result.

Left faithful (the port is a 1:1 translation and the picker path is still
driven; the mutation check confirms its assertions bite when the *state* is
wrong). Reporting it because an upstream test whose name describes a behaviour
it cannot detect is worth an issue, and because it is an easy fix upstream:
seed a second dashboard, or select the non-default one.

## 6. Small notes

- `getSimpleEmbedIframeContent` gate aside, the preview iframe assertions are
  positive `toBeVisible` calls, so the "preview never painted" vacuity class
  (`custom-elements-api`) cannot apply.
- The `x-metabase-embedded-preview` header (EMB-945) reads from
  `request.allHeaders()` (lowercased by Playwright, as by Cypress).
- No entity-picker *search box* is used anywhere in this spec, so the
  Enter/debounce hazard in the brief never arose. The parent→child pacing hazard
  also did not reproduce: back-to-back `item-picker-level-0` →
  `item-picker-level-1` clicks (the shape the proven shared helper already uses)
  were stable 2/2 runs × 2 tests plus `--repeat-each=2`, so no `toPass`
  re-click loop was added. If it ever flakes, that is where to look.
- Both `cy.intercept("POST", "/api/card/*/query")` and
  `"/api/activity/recents?*"` (and `@searchQuery` in the second describe) are
  never awaited → dropped per rule 2.
- Snowplow is the subject of 4 of the 7 tests, so `installSnowplowCapture` is
  used rather than rule 6's no-op stub. It again needed zero modification —
  now proven on a sixth independent spec.

**No product-bug claims from this port.** Nothing fixme'd. Every fix during
stabilisation (exactly one: §4) was in my own port.
