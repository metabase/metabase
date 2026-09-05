# sdk-iframe-theming — port report (slot 5, :4105, jar mode)

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/theming.cy.spec.ts` (265 lines)
Target: `tests/sdk-iframe-theming.spec.ts`

## Result

- **3 tests, 3 executed, 3 passed.** 0 skipped, 0 `fixme`, 0 upstream-skip carries.
- Stable under `--repeat-each=2` (6/6).
- `bunx tsc --noEmit` clean.
- **No harness changes.** `support/sdk-iframe.ts` consumed read-only — the
  seventh Group A spec in a row to need zero changes. No new support module was
  needed either: `waitForDashboardGet` (`sdk-iframe-eajs-internal-navigation.ts`)
  and `waitForCardQuery` (`sdk-iframe-embedding.ts`) already exist and were
  imported rather than re-declared.

## No dividends

No product bugs, no strengthened assertions, no Cypress-masked behaviour. Every
assertion ported 1:1 (`have.css` → `toHaveCSS`), plus the standard Group A
render gate (`waitForSimpleEmbedIframesToLoad`) that restores what upstream's
blocking `loadSdkIframeEmbedTestPage` provides.

## Mutation results — all four kill

The run is suspiciously fast (0.8–1.5s per test on a warm slot backend), so
every assertion was inversion-probed. All mutations changed the **input** (the
theme value fed to `defineMetabaseConfig`), never the expectation.

| # | mutation | outcome |
| --- | --- | --- |
| 1 | test 1 `theme: DARK_THEME` → `LIGHT_THEME` | RED at `dashboard` background: expected `rgb(39,39,59)`, got `rgb(255,255,255)` |
| 2 | test 2 `fontSize: "10px"` → `"40px"` | RED: themed column measured **268px** vs default **150.36px** — the width really tracks the themed font size |
| 3 | test 3 `setDarkTheme()` → applies `LIGHT_THEME` | RED at step 2's dashboard background |
| 4 | test 1 theme with only `brand` / `text-primary` overridden (background left dark) | RED on **each** `getByText` colour assertion in turn — `Showing first 2,000 rows` got `rgb(4,5,6)`, `Product ID` got `rgb(1,2,3)` |

Mutation 4 was run specifically because mutations 1–3 all died on the *first*
assertion of their test, which left the two `getByText` colour checks unproven.
It also settles the brief's `<style>`-block hazard empirically: `getByText`
resolves to real themed DOM (Playwright's text engine skips `<script>`/`<style>`,
and the received values track the injected theme), not to stylesheet text.

Jar mode confirmed independently of the run banner: the failure log shows the
`dashboard` div's class list as `pn9Ak Wr5uR Pic4k kqRqQ …` — minified
CSS-module names, i.e. the production bundle. `/api/session/properties` reports
`version.hash 751c2a9`, matching `target/uberjar/COMMIT-ID` (`751c2a98`).

## Claims from the brief that did NOT reproduce (or did not apply)

- **"CSS-module class names are minified in the jar"** — reproduced and visible
  in the logs above. Not an issue here: nothing selects on a class. The spec's
  own subject is the computed property, so the faithful port is already the safe
  one.
- **"Colour assertions: compare parsed values, not string literals"** — did not
  need it. Every expected value upstream is already written in the canonical
  `rgb(r, g, b)` form Chromium serialises `getComputedStyle` to, so `toHaveCSS`'s
  string compare matches exactly. Adding a parser would have been unfaithful
  machinery for no gain. Worth correcting in future briefs: `have.css` and
  `toHaveCSS` both read computed values, so a literal that already round-trips
  needs no normalisation.
- **The wave-10 "bundled Chromium ≠ Chrome for pixel/text metrics" caveat** — a
  live risk for test 2, which is a text-measurement test. It does **not** bite,
  because the assertion is a *relative* comparison (themed < default) measured in
  the same engine in the same test, with a ~2× margin at 10px vs default. Nothing
  pixel-exact is pinned. (This is the shape PORTING's "don't pin data-derived
  magic numbers" bullet recommends, and upstream already wrote it that way.)
- **`textContent()` on an iframe body also reads injected `<style>`** — not
  applicable; no text-content assertions in this spec, and see mutation 4.
- **Absence rule** — not applicable. This spec has no absence assertions.

## Deviations from upstream, and why

1. **`satisfies MetabaseTheme` dropped.** Upstream imports the type from
   `metabase/embedding-sdk/theme/MetabaseTheme`; that path is not resolvable
   from this package's tsconfig. Compile-time only — the JSON handed to
   `defineMetabaseConfig` is byte-identical.
2. **`filter(":contains('Product ID')")` → `filter({ hasText: /Product ID/ })`.**
   The *regex* form is a case-sensitive substring match, matching jQuery's
   `:contains()`; the string form would be case-insensitive.
3. **Width read via `evaluate(el => el.getBoundingClientRect().width)`**, the
   same call upstream makes, rather than `boundingBox()` — measured in the
   frame's own coordinate space and independent of Playwright's actionability
   view of the cell.
4. **One added anchor, declared:** `expect(cell).toBeVisible()` before measuring.
   `locator.evaluate` auto-waits only for *attachment*, which does not guarantee
   the column has been laid out; Cypress's chain retry plus command-queue latency
   supplied that settle implicitly. This is a gate, not a defensive `.first()`.
   The `.first()` calls that are present are all direct ports of upstream's own
   `.first()`.
5. **The light-theme assertion block factored into `assertLightTheme`.** Upstream
   repeats it verbatim at steps 1 and 3 of "should handle dynamic theme updates" —
   two identical blocks, so this consolidates toward a shape Cypress already has
   (PORTING's faithfulness-over-DRY rule permits exactly this case). No other
   duplication was touched.

## Summary (3 lines)

Straight 1:1 port; the theming tier turned out to be one of the easier Group A
specs because its assertions are already on computed style rather than on
anything build-dependent. Zero harness edits, zero new helpers, zero skips, and
all three tests survive input inversion, so the sub-second runtimes are real
speed and not vacuity.
