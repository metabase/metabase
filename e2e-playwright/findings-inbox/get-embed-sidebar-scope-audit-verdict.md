# AUDIT VERDICT — `getEmbedSidebar()` scope discrepancy: item CLOSED

Slot 5 (:4105), jar mode. Backend verified: `version.hash = 751c2a9` vs
`target/uberjar/COMMIT-ID = 751c2a98`.

## The item

`support/sdk-embed-setup.ts`'s `getEmbedSidebar()` returns the `<aside>`.
Upstream's is `modal().first().within(() => cy.findByRole("complementary"))`,
and **Cypress `.within()` yields its ORIGINAL subject**, so upstream's helper
actually returns the **MODAL**. Ours is therefore NARROWER. Invisible for
sidebar controls; it bites anything in the modal but outside the aside —
notably the preview iframe, which is what `common-ee` hit.

`user-settings-persistence` was previously audited: not applicable.
**`tests/sdk-embed-setup-select-embed-options.spec.ts` was the last unaudited
spec.**

## Verdict: **NO.** No upstream `getEmbedSidebar()` lookup in
`select-embed-options` reaches outside the `<aside>`. Nothing to fix. The shared
helper was **not** touched.

## Evidence

Upstream has **72** `getEmbedSidebar()` call sites, **6** of them
`.within()` blocks (lines 225, 234, 598, 607, 702, 856). Every block body
touches sidebar controls only:

| line | block contents | outside aside? |
| ---- | -------------- | -------------- |
| 225 | `button("Back")` ×2, `findByLabelText("Metabase account (SSO)")` | no |
| 234 | `button("Next")`, `findByLabelText("Allow subscriptions")` → `tooltip-warning` info icon | no |
| 598 | `button("Back")` ×2, SSO radio | no |
| 607 | `button("Next")`, `findByLabelText("Allow alerts")` → info icon | no |
| 702 | `behavior-docs-link` (visible + href + absent), `Back`, `Metabot`, `Next` | no |
| 856 | `findByText("Brand color")` | no |

**I widened the audit beyond `.within()` blocks**, which is where the brief
framed it: the discrepancy applies to *any* descendant lookup, since upstream's
chained `getEmbedSidebar().findByX(…)` searches the MODAL while ours searches
the aside. The dangerous case is a chained **absence** assertion that would pass
vacuously under the narrower scope. There are exactly two such sites, both
`getEmbedSidebar().findByLabelText("Reset colors").should("not.exist")`
(lines 861, 909) — and the *same test* asserts
`getEmbedSidebar().findByLabelText("Reset colors").should("be.visible")` at line
881. That in-scope positive proves "Reset colors" lives inside the aside, so
both absence checks are non-vacuous under the narrow helper.

The same self-anchoring holds for `behavior-docs-link` (line 702): asserted
visible *and* absent within one block, in one scope.

The everything-else sites (`H.getSimpleEmbedIframeContent()`,
`cy.findByTestId("brand-color-picker")`, `H.popover()`, `codeBlock()`) are
page-scoped upstream, outside any `within`, so the helper's scope never applies
to them — which is precisely why this spec does not reproduce `common-ee`'s
preview-iframe problem.

## Empirical backing

Ran the landed port on the jar: **21/21 green** (47.3s) with the narrow
aside-scoped helper — including `can change brand color and reset colors` and
`shows a docs icon in behavior section depending on a component`, the two tests
carrying the absence assertions. A narrowed scope can only ever *fail to find*
an element, never resolve a different one, so green + the in-scope positive
anchors is sufficient.

The port already scopes both to the sidebar with a visible-anchor in the same
scope (spec lines 760/771 for `behavior-docs-link`, 927/951/984 for
`Reset colors`), so no local fix was needed either.

## Consequence

All specs consuming `getEmbedSidebar()` are now audited. **The narrow helper
stands.** The only spec that ever needed modal scope is `common-ee`, which
handled it locally with page-scoped iframe helpers — the correct pattern, and
the one to repeat if it recurs.

Note: the `⚠️ KNOWN SCOPE DISCREPANCY` comment in `support/sdk-embed-setup.ts`
still lists `select-embed-options` and `user-settings-persistence` as
"Still to audit". Both are now done and the line is stale, but the shared module
was deliberately left untouched per the no-shared-edits rule — someone with the
remit should drop that last sentence.
