# official-collections

Port of `e2e/test/scenarios/organization/official-collections.cy.spec.js` →
`tests/official-collections.spec.ts`. 8 tests, all green on the jar (slot 5),
16/16 under `--repeat-each=2`, tsc clean. New helpers in
`support/official-collections.ts`. No `test.fixme`, no product-bug claims, no
infra gating (jar activates the `pro-self-hosted` token for the EE describes).

## Fixes classified

- **Known gotcha (Mantine SegmentedControl)** — the collection-type control in
  the new-collection modal is a Mantine `SegmentedControl`
  (`FormCollectionAuthorityLevel.tsx`). `getByText("Official").click()` resolves
  to the option's `Center` root, but the `SegmentedControl-innerLabel` span
  intercepts pointer events, so the real click times out. Fix: `click({ force:
  true })` — the intercepting span is a child of the label, so the change
  handler still fires. This is the same *family* as the wave-10 note
  "Playwright refuses to click a descendant of an aria-disabled ancestor" /
  "Mantine Select option rows can't be clicked even with force", but the
  SegmentedControl case IS clickable with `force` (unlike Select). Candidate for
  a one-line addition to the Mantine-component gotcha cluster in PORTING.md.

- **Port refinement (Mantine Modal-root testid is not "visible")** — Cypress's
  `cy.findByTestId("new-collection-modal").then((modal) => …)` only resolves
  existence; the testid sits on the Mantine `Modal-root` wrapper, which
  Playwright's `toBeVisible()` reports as **hidden** (the visible dialog is an
  inner element). A literal `expect(getByTestId("new-collection-modal"))
  .toBeVisible()` gate fails on every attempt while the modal is plainly open.
  Dropped the gate; interactions scope to `modal(page)`
  (`[role='dialog'][aria-modal='true']`), which resolves the visible dialog.
  General rule: don't port a `findByTestId(...).then()` existence-resolve as a
  `toBeVisible()` on that testid when the testid is on a Mantine `*-root`
  wrapper.

## Notes on faithful-port decisions

- `cy.icon("official_collection" | "folder")` → the class-based `icon()` helper
  (`.Icon-<name>`), which is what `cy.icon` resolves. These per-class icon
  selectors are stable on the jar bundle. `.should("exist"/"not.exist")` →
  `not.toHaveCount(0)` / `toHaveCount(0)`; the navbar's `.should("be.visible")`
  ported as `.filter({visible:true}).first()` (ANY-match, PORTING rule 3).
- The 402 API gate asserts the raw response — `status()`, `statusText()`, and a
  `toMatchObject` deep-include of `getPartialPremiumFeatureError("Official
  Collections")` (ported from `e2e-enterprise-helpers.js`).
- `H.createCollection({ authority_level })` has no shared port (the existing
  `createCollection` helpers in dashboard-core / collections-* drop
  `authority_level`), so `createOfficialCollection` lives in the new module
  rather than editing a shared file.
- Search-result badge assertions anchor `has` locators on `page`, not the
  search-app Locator (PORTING collections gotcha); the collection result's name
  is disambiguated via the `search-result-item-name` testid because the
  collection name also appears as the question/dashboard results' location
  label.

## Consolidation candidate (later pass)

- `createOfficialCollection` (authority_level-aware POST /api/collection) is the
  4th independent `createCollection` variant in the support tree; the shared
  `createCollection` ports should grow an optional `authority_level` and the
  copies collapse.
