# sdk-embed-setup-common-ee — port findings

Slot 4 (:4104), jar mode. Backend verified before trusting the green:
`version.hash = 751c2a9` vs `target/uberjar/COMMIT-ID = 751c2a98`, process is
`java -jar target/uberjar/metabase.jar`.

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/common-ee.cy.spec.ts`
(229 lines, 8 tests) → `tests/sdk-embed-setup-common-ee.spec.ts`.

## Numbers

- **8 executed, 0 gate-skipped, 0 fixme.** No `test.skip` anywhere.
- **8/8 green** (16.6s). **16/16 under `--repeat-each=2`** (32.6s).
- `bunx tsc --noEmit` clean.
- **No support-module changes.** `support/sdk-embed-setup.ts` consumed read-only
  — that is now **nine** Group B specs with zero helper churn. No companion
  support module either (third in a row); every helper this spec needed already
  existed (`command-palette.ts`, `sharing.ts`, `embedding-dashboard.ts`,
  `sdk-iframe.ts`, `ui.ts`, `collections-reproductions.ts`).

## Is the EE tier gate real? YES — and it is the strongest instance seen in this tier

Structurally this matches `guest-embed-ee`: no `@OSS` tag, no EE-only describe,
the entire EE-ness is `H.activateToken("pro-self-hosted")`. So there is nothing
to `test.skip`, and the gate is an **assertion gate** — this file's

> "allows to select the `Metabase Account` item even when simple embedding
> setting is disabled" → SSO radio **enabled**

is the same setup as its `-oss-and-starter` sibling's

> "does not allow to select the `Metabase Account`, when token feature is missing
> (oss)" → SSO radio **disabled**.

**Measured (probe A: `activateToken` removed from the beforeEach, everything else
untouched): 7 of 8 tests fail.** The one survivor is
"allows to select the `guest` item even when static embedding setting is
disabled" — which is *verbatim* the one test the OSS sibling also carries.

That is a sharper result than the tier's prior data points suggested. The brief
(correctly) warned that `select-embed-options`' tier gating turned out not to be
real, and that "EE jar with no token" usually behaves like OSS. **Here it does
not**: without `embedding_simple` / `sso_jwt` in `token-features`, the wizard
genuinely refuses SSO, and the whole wizard chain (`navigateTo*Step`) collapses
because the SSO auth mode is unselectable. So a reflexive skip would have deleted
7 tests' worth of coverage, and a reflexive "it'll run fine unlicensed" would
have been wrong too.

**`activateToken` was verified to actually take**, not just to not-throw (brief's
warning about `failOnStatusCode: false`): `GET /api/session/properties` on :4104
returns `token-features` with `embedding_simple: true`, `sso_jwt: true`,
`embedding_sdk: true`. Test 5 also functions as a permanent live check of this —
it is the assertion that flips when the token is absent.

## Mutation results — non-vacuous

Probe B/C/D, one run, five independent mutations, all **input** inversions
(nothing corrupted an expectation):

| mutation | test | result |
| --- | --- | --- |
| remove the `[aria-label='Close']` click | close-button | ✘ `toHaveCount(0)` |
| remove the "Done" click | Done-button | ✘ `toHaveCount(0)` |
| remove `page.goBack()` | browser-history | ✘ `toHaveCount(0)` |
| remove `enableJwtAuth` | EMB-1783 SSO defaults | ✘ `toBeChecked()` |
| open "Orders, Count" instead of "Orders" | auth-switch preview | ✘ in-iframe `toBeVisible()` |

**Exactly those 5 failed; the 3 unmutated tests passed.** In particular the three
`H.modal().should("not.exist")` ports (retrying `toHaveCount(0)`, per the
corrected absence rule) are **not** vacuous — they catch a modal that is still
open. They were never at risk of the mount-lag vacuity class anyway: the page
underneath (`/admin/embedding` with its `sdk-setting-card`s) is fully rendered
*before* the modal opens, and upstream's own following card assertion is kept as
the positive anchor.

## One real port finding: `getEmbedSidebar()` does NOT yield the sidebar

Worth recording because it is a latent trap for the rest of this tier, and the
shared helper's docstring implies the opposite.

```ts
export const getEmbedSidebar = () =>
  modal().first().within(() => cy.findByRole("complementary"));
```

Cypress's **`.within()` yields its original subject**, not the callback's result.
So `getEmbedSidebar()` yields `modal().first()` — the whole wizard modal — and
the `findByRole("complementary")` inside is a side-effecting existence check.
Every `getEmbedSidebar().within(...)` upstream is therefore scoped to the
**modal**, not the `<aside>`.

Our port (`modal(page).first().getByRole("complementary")`) resolves the aside,
i.e. it is a **narrowing**. For eight landed specs that has been invisible,
because every query inside those `within` blocks targets sidebar content. This
spec is the first where it matters: the last test's `within` block reaches for
the **preview iframe**, which lives in the modal but *outside* the aside. Ported
literally against the aside-scoped helper it would resolve nothing.

Fix in this port (no shared-file change): keep `getEmbedSidebar(page)` for the
radio labels, use the page-scoped `waitForSimpleEmbedIframesToLoad` /
`getSimpleEmbedIframe` for the iframe — which resolves the same elements upstream
does. **Not a bug in the shared helper** — the aside scope is a strict narrowing
that upstream's uniqueness guarantees make safe — but anyone porting a
`getEmbedSidebar().within()` block that queries something *outside* the aside
needs to know. `select-embed-options` and `user-settings-persistence` are the
remaining specs to check.

## Things from the brief that did NOT reproduce / did not apply

- **`page.goBack()` bfcache trap (wave-12 gotcha) did not bite.** The
  browser-history test asserts the modal is *gone* after going back, which is
  exactly the shape that gotcha warns about. It passes 2/2 because the "New
  embed" click is an SPA history push within an already-loaded document, so the
  back is a same-document popstate and bfcache is never involved. Recording it
  so the next agent does not pre-emptively work around a non-problem.
- **Snowplow.** Unlike all eight landed Group B siblings, this spec asserts
  *nothing* about snowplow — no `expectUnstructuredSnowplowEvent`, and no
  `afterEach(H.expectNoBadSnowplowEvents)`. `installSnowplowCapture` is installed
  anyway, purely as a guard: `H.enableTracking()` is ported faithfully, and on a
  clean jar boot `snowplow-url` defaults to `https://sp.metabase.com`, so a
  tracking-enabled jar run would fire real analytics at Metabase's production
  collector. Nothing asserts on the capture.
  **Honest caveat:** the slot backend used here carried a leaked
  `MB_SNOWPLOW_URL=http://localhost:9090` in its process env, so the production
  URL was not actually in play on *this* run. The guard is for the clean-boot
  case. (Consistent with PORTING.md's batch-13 qualifier that a leaked
  `MB_SNOWPLOW_*` is a non-issue for `installSnowplowCapture` either way.)
- `completeWizard` is untouched here. Note though that this spec's Done-button
  test *does* reach an enabled "Done": it calls `publishChanges` first, which
  flips `enable_embedding`. That is the missing precondition the helper's
  "unexercised / permanently disabled" note asks for — so `completeWizard` is
  dead code upstream, but not un-runnable.

## Summary (3 lines)

Straight port, no dividends, no product-bug claims: 8/8 executed and green on the
jar, 16/16 under `--repeat-each=2`, tsc clean, zero shared-support changes.
The EE tier gate here is **real and load-bearing** — dropping `activateToken`
fails 7 of 8 tests, leaving only the one test the OSS sibling also has — which
contradicts the tier's working assumption that unlicensed-EE ≈ OSS.
The one thing worth propagating is that Cypress's `getEmbedSidebar()` yields the
**modal**, not the aside, so `within` blocks reaching outside the sidebar
(iframes) must not be ported against the aside-scoped helper.
