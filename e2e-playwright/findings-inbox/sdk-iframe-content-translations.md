# sdk-iframe-content-translations (Group A, slot 4 / :4104, jar mode)

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/content-translations.cy.spec.ts` (213 lines)
Target: `tests/sdk-iframe-content-translations.spec.ts`

## Result

- **3 tests, 3 executed, 0 skipped, 0 fixme.** Green on the jar
  (`target/uberjar/metabase.jar`, COMMIT-ID `751c2a98`; the slot backend reports
  `version.hash 751c2a9`, confirmed via `/api/session/properties`).
- **`--repeat-each=2`: 6/6 passed.**
- **`bunx tsc --noEmit`: clean.**
- No harness change. No new `support/` module. Nothing shared was edited.

## No dividends

No product bug, no strengthening, no Cypress-masked issue. Everything this spec
needed was already on the shelf.

## What was reused rather than rebuilt (the brief's prediction held)

- `uploadTranslationDictionaryViaAPI` — `support/content-translation-dashboards.ts`.
  Used verbatim; the `germanFieldNames` fixture is *not* what this spec uses (it
  has its own six-row content dictionary), so only the uploader was needed.
- `prepareGuestEmbedSdkIframeEmbedTest` and `signGuestJwt` —
  `support/sdk-iframe-guest-token-refresh.ts`.
- `modal(scope)` — `support/ui.ts`, which already takes a `FrameLocator`.

**`H.getSignedJwtForResource` needed no new signer.** Upstream
(`e2e-embedding-helpers.js:408`) signs `{ resource: { [type]: id }, params, iat,
exp }` HS256 with `JWT_SHARED_SECRET` — the exact payload `signGuestJwt` already
produces, including the explicit `iat` (PORTING's JWT rule). Its
`expirationMinutes = 10` default maps to `expirationSeconds: 60 * 10`.

**Stale doc note:** `findings-inbox/sdk-iframe-harness.md` §2 still lists
`prepareGuestEmbedSdkIframeEmbedTest` under "Not yet ported (needed by 3
specs)". It has been ported since, in the `guest-token-refresh` port. Worth
correcting when the inbox is merged, since it will otherwise send the next agent
to rebuild it.

The only thing written inline was a 3-line scoped `entityPickerModal` (the
shared `notebook.ts` copy is `Page`-typed; upstream calls it inside
`getSimpleEmbedIframeContent().within(...)`, i.e. scoped to the iframe body).
Not enough to justify a module — matches the last three Group A siblings, which
also needed no companion support file.

## Brief claims that did NOT apply

- **"`textContent()` on an iframe body also reads injected `<style>` — a live
  hazard for you, since a translation spec asserts on text."** It is not a
  hazard here. Every assertion in this spec is an element-level `findByText` →
  `getByText`, and there is no `should("contain", …)` / whole-body text read
  anywhere in the original. Checked, not applicable. (It *was* live for
  `view-and-curate-content`, which does use `should("contain")`.)
- **The absence rule.** This spec contains **zero** absence assertions — all
  nine checks are "the translated string is visible". The specific vacuity the
  brief warned about (asserting an untranslated string absent) is not present
  upstream.
- **`cy.type()` clicks its subject / `cy.get()` resets the subject.** Neither
  appears in this spec.
- **`H.createCollection` is not a thin wrapper** in the sense that mattered
  here: it posts `description`, which the shared `support/dashboard-core.ts`
  `createCollection(api, {name, parent_id})` drops — and `"Test description"` is
  one of the six translated strings. Ported as a direct `POST /api/collection`
  with the four fields upstream sends, rather than through the shared helper.
  (Not a bug in the shared helper; it just has a narrower signature.)

## Mutation results (all four inversions killed their target)

The first mutation killed tests 1 and 2 at their *first* assertion, so three
further targeted mutations were run for the later assertions — the pattern three
sibling agents also hit.

| # | mutation | expected | observed |
| --- | --- | --- | --- |
| A | drop `uploadTranslationDictionaryViaAPI` from `setupContentTranslations` | tests 1+2 die | ✅ both fail at the first German string (`Test Sammlung` breadcrumb / `Testfrage`); test 3 unaffected (it has its own upload call) |
| B | guest dictionary row `locale: "de"` → `"fr"` | test 3 dies at the title | ✅ fails at `EMB-1478 Frage` (line 335), **after** passing the dictionary-URL assertion — so B proves the title check and leaves the URL check exercised |
| C | remove `question.click()` in test 1 | the post-navigation breadcrumb pair is live | ✅ fails at the `Testfrage` breadcrumb (line 208); the `Test Sammlung` breadcrumb still passes, so the two are independently discriminating |
| D | remove `collectionPickerButton.click()` in test 2 | the entity-picker assertion is live | ✅ fails at `entity-picker-modal` → `Test Sammlung` (line 249) |
| E | assert `toContain("/dictionary/BOGUS" + token)` | the URL assertion is a real value check | ✅ fails, and prints the real URL: `http://localhost:4104/api/ee/content-translation/dictionary/<jwt>?locale=de` |

Mutation E is worth keeping in the record for two reasons beyond non-vacuity:

1. It shows the port reproduces the **EMB-1478 regression signal** exactly — the
   fetch carries the JWT path segment, not the bare `/dictionary?locale=de` the
   bug produced.
2. The captured URL is on **`localhost:4104`**, i.e. this slot — an incidental
   confirmation of the harness's anti-FINDINGS-#39 property on a spec that does
   not call `assertEmbedTargetsThisSlot`.

## Unexplained (recorded, not theorised)

Test durations are very low for what these tests do — 0.7–1.8s each including
`restore()`, `activateToken`, three API creates, a dictionary upload, the
customer-page load and the embed render. I confirmed via the mutations that the
work genuinely happens (removing any input reliably reddens the right
assertion), and via mutation E that the request really hits `:4104`, so this is
recorded as "faster than expected on a warm kept slot backend" rather than
explained. The same run took 11.3s for test 1 when a mutation forced it to burn
an expect timeout, so the variance is in the failure path, not the happy path.

## Summary (3 lines)

Straight port: 3/3 green on the jar, 6/6 under `--repeat-each=2`, tsc clean, no
harness or shared-module changes and no new support file.
Everything the spec needed already existed — the dictionary uploader from the
landed content-translation ports, and the guest-embed prepare + JWT signer from
`guest-token-refresh` (whose existence the harness findings doc still denies).
Five mutations, five kills; no dividends, and three of the brief's foreseen
hazards (iframe `textContent`, absence vacuity, `cy.type()`'s click) simply do
not occur in this spec.
