# sdk-iframe-view-and-curate-content — port findings

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/view-and-curate-content.cy.spec.ts` (343 lines)
Target: `e2e-playwright/tests/sdk-iframe-view-and-curate-content.spec.ts`
Slot 5 (:4105), jar mode (`version.hash` `751c2a9` == `target/uberjar/COMMIT-ID` `751c2a98`).

## Result

- **15 passed / 0 skipped / 0 fixme.** All 15 executed — no gate-skips (the file
  needs only a bleeding-edge token, which the spike backend has).
- **30/30 under `--repeat-each=2`** (28.1s).
- `bunx tsc --noEmit` clean.
- No shared support module touched. No new support module needed: `setupEmbed` is
  spec-local upstream and stays spec-local (same shape the eajs port uses inline).
  The spec registers no response aliases, so it does not need — and deliberately
  does not add a third copy of — `waitForDashCardQuery`.
- No product-bug claims. No `sdk-iframe.ts` changes requested.

## The green is fast (13.2s / 15 tests) — here is the proof it is real

Per the anti-#39 discipline, "fast green" was not accepted:

1. **Slot proof (structural + document location).** A temporary
   `assertEmbedTargetsThisSlot(page, mb)` was added to the first test and run:
   it passed, i.e. the embed iframe's `src` origin *and* the iframe document's
   own `location` are `http://localhost:4105`. (Scope caveat, stated: `:4000`
   was **down** during this session — `curl :4000/api/health` no response — so a
   misdirection would have failed loudly anyway. The guard is what makes the
   result trustworthy on a box where :4000 is up.) The probe was removed; it is
   not in the landed spec.
2. **Mutation test, 6 mutations.** Each config attribute the spec claims to
   "pass through" was deleted (or perturbed) and the file re-run. **5 of 6
   killed exactly the intended test and nothing else:**

   | mutation | test that failed | assertion |
   | --- | --- | --- |
   | drop `collection-visible-columns` | pass through collection-visible-columns | `not.toContain("Last edited by")` |
   | `collection-page-size` 5 → 3 | pass through collection-page-size | `toHaveCount(5)` |
   | drop `with-new-question="false"` (read-only) | hide New Question | `count() === 0` |
   | drop `with-new-dashboard="false"` | hide New Dashboard | `count() === 0` |
   | drop `with-new-question="false"` (read-write) | hide New Question | `count() === 0` |

   The 6th survived — see below. Runtime is legitimate: `restore()` is ~65ms and
   each embed load is ~0.5–1.7s.
3. **Non-CSS-pollution check.** `toContainText`/`textContent()` on the iframe
   `body` also read the embed's injected `<style>` text. Verified this pollutes
   nothing here: with `collection-visible-columns='["name"]'`, `"Type"` is
   genuinely absent (`false`), so the `Type` assertion discriminates.

## Finding: one upstream assertion is VACUOUS by construction (not a bug, not fixed)

`should pass through data-picker-entity-types parameter` ends with:

```js
H.getSimpleEmbedIframeContent().should("contain", "Orders");
H.getSimpleEmbedIframeContent().should("not.contain", "Orders model");
```

The second line **cannot fail**. Measured both ways on the default snapshot:
with `data-picker-entity-types='["table"]'` *and* with the attribute removed
entirely, the data picker's body text contains no `"Orders model"`, no
`"Model"`, and no `"model"` at all — the default snapshot ships **no models**.
So the "but not Orders model" half asserts nothing; only the `contain("Orders")`
half discriminates, and that passes with or without the restriction too (the
Orders *table* is listed either way). The test's stated subject
(`data-picker-entity-types` filters out models) has **zero executable coverage**
on this snapshot — which is why it was the one mutation that survived.

Ported faithfully rather than strengthened (faithfulness > cleverness), and
flagged in the spec header. Fixing it upstream would mean seeding a model in the
fixture; that is an upstream test-quality issue, **not** a product bug and not a
migration dividend. Same class as the "helper silently discards its argument"
entries already in PORTING.

## Adaptations (all ordinary, none novel)

- `should("not.exist")` / `should("not.contain")` are ONE-SHOT absence checks →
  ported as non-retrying `expect(await loc.count()).toBe(0)` /
  `expect(text).not.toContain(...)`, each **preceded by a positive assertion on
  a mirror of the expected post-state** so the check isn't satisfied by "nothing
  has rendered yet". Mirrors chosen: for `with-new-question="false"` the
  collection table (`"Name"` + a visible `Orders` row); for
  `with-new-dashboard="false"` the sibling `New question` button (still enabled
  by config), and vice versa. The mutation table above confirms each still fails
  for the right reason.
- `H.getSimpleEmbedIframeContent()` blocks on a loaded, non-empty iframe body;
  the Playwright `FrameLocator` is lazy, so `setupEmbed` calls
  `waitForSimpleEmbedIframesToLoad` to restore that gate.
- `cy.get("iframe[data-metabase-embed]").should($iframe => expect($iframe.contents().find("body")).to.exist)`
  is **vacuous in Cypress** (a jQuery collection is always truthy). Ported as
  what it actually enforces — the embed iframe resolves — with a comment, rather
  than inventing a stronger assertion.
- `H.modal().contains("header", "Create a new collection").parent()` →
  `modal(frame).locator("header").filter({ hasText: /Create a new collection/ }).first().locator("..")`.
  Case-sensitive regex because `cy.contains(sel, str)` is case-sensitive
  substring (rule 1's `cy.contains` corollary), not an exact match.
- Breadcrumb-navigation test: gated the "Our analytics" crumb click on the
  settled post-navigation state (`query-visualization-root` visible) before
  resolving the locator — the known "React reuses Mantine `Breadcrumbs` anchor
  nodes while swapping the trail" hazard. **Prophylactic**: I never observed it
  fail here, and I am labelling it as prophylactic rather than presenting it as
  a catch.

## Things I deliberately did NOT do

- No `.first()` beyond the two places upstream itself uses `findAllByText(...).first()`.
  Every other `findByText` ported as a bare unique locator; none hit strict mode
  across 30 runs — including `New dashboard`, where I expected a possible
  button-plus-modal-title collision and there was none.
- No `force: true` anywhere; nothing needed it.
- `fill()` (not `pressSequentially`) for the two placeholder-driven modal inputs
  — no debounce/typeahead behaviour depends on keystrokes there, and the
  create-dashboard flow completes.

## Summary (3 lines)

Straight port: 15/15 green on the jar, 30/30 under `--repeat-each=2`, tsc clean,
no shared-module changes and no new support module.
The fast green is backed by a slot guard (iframe src + frame document both on
:4105) and a 6-way mutation test in which 5 mutations killed exactly the right test.
The 6th survivor exposed a vacuous upstream assertion — `not.contain("Orders model")`
can never fail because the default snapshot has no models — reported, ported as-is.
</content>
