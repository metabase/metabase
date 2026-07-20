# sdk-embed-setup-user-settings-persistence

Port of
`e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/user-settings-persistence.cy.spec.ts`
(130 lines) → `tests/sdk-embed-setup-user-settings-persistence.spec.ts`.

Slot 5 (:4105), **jar mode** — `version.hash` `751c2a9` vs
`target/uberjar/COMMIT-ID` `751c2a98`, confirmed on the running backend.

**Result: 2 executed, 2 passed, 0 gate-skipped, 0 fixme.**
`--repeat-each=2` → 4/4 green (15.7s). `bunx tsc --noEmit` clean.
`support/sdk-embed-setup.ts` consumed **read-only, unchanged** — that is now ten
Group B specs with zero helper edits. No companion support module (three in a
row now).

---

## AUDIT VERDICT — the `getEmbedSidebar()` modal-vs-aside scope discrepancy

**Not applicable to this spec. Nothing to fix; the shared helper is untouched.**

The spec **never calls `getEmbedSidebar()`**. Every locator in the original is
page-scoped: `cy.findByTestId("theme-card-Custom")`,
`cy.findByTestId("brand-color-picker")`, `H.popover()`,
`H.getSimpleEmbedIframeContent()`, `cy.findByTestId("sdk-iframe-embed-setup-modal-content")`,
`cy.get("[data-iframe-loaded]")`, `cy.findByTestId("preview-loading-indicator")`.

There is exactly one `.within()` in the file, in `reopenNewEmbedModal`:

```js
cy.findAllByTestId(/(sdk-setting-card|guest-embeds-setting-card)/)
  .first()
  .within(() => { cy.findByText("New embed").click(); });
```

That scopes to the **admin-page setting card**, not the wizard modal, and the
click lands on the `findByText` result regardless of `.within()`'s
yield-the-original-subject behaviour. So the discrepancy has no purchase here.

`getEmbedSidebar` is reached only *inside* `navigateToEmbedOptionsStep`, and
only for sidebar controls (auth radio, experience card, entity button, "Next")
— the case where aside and modal scope are interchangeable, already proven
across the landed Group B specs. **Nothing in this spec reaches for the preview
iframe (or anything else outside the `<aside>`) through a sidebar-scoped
locator.** The preview is reached page-scoped in both the original and the port.

Net: the `common-ee` finding is real and correctly recorded, but of the two
specs it flagged for follow-up, this one is clean. `select-embed-options` is the
remaining one (and note it has already landed with its own page-scoped
`embedPreview` helper in `support/sdk-embed-setup-select-embed-options.ts`,
which looks like it sidesteps the same trap by construction — but I did not
audit it and am not claiming it).

---

## Tier gating: REAL for this spec (probed, not assumed)

Per FINDINGS #49 / the brief, I probed by removing `activateToken("pro-self-hosted")`
and changing nothing else:

**2 of 2 tests fail**, both at their theme-card click:
- "persists brand colors" — 30s timeout waiting for `theme-card-Custom`
- "finishes loading …" — 30s timeout waiting for `theme-card-Sunset`

With the token active, `GET /api/session/properties` on :4105 shows
`token-features.embedding_simple: true` (checked directly — "activateToken
didn't throw" is not evidence). Consistent with the FE:
`getSettingsToPersist` (`use-sdk-iframe-embed-settings.ts`) returns `{}` unless
`isSimpleEmbedFeatureAvailable`, and `ThemeSelectorSection` only renders the
theme-card grid when saved themes exist. I did not isolate *which* of those two
gates fires first — recording the observation, not inventing the mechanism.

There is no `@OSS` tag and no EE-only describe, so there was never anything to
`test.skip`; the whole spec is EE-by-token, like `common-ee`. This adds a third
data point to "tier gating does not generalise": `select-embed-options` not
real, `common-ee` real, **this one real**.

---

## Two port decisions worth recording

### 1. `cy.wait("@persistSettings")` had to become a keyed recorder, not a gate

The alias is registered in the `beforeEach`, but the wizard PUTs
`/api/setting/sdk-iframe-embed-setup-settings` on **every** settings change, and
`getSettingsToPersist` sends `{}` whenever no theme is selected. So by the time
upstream's `cy.wait("@persistSettings")` runs, several such PUTs have already
fired and it is satisfied **retroactively by an unrelated empty one**. A literal
`waitForResponse` on the pathname would be a gate that enforces nothing.

Ported as a passive `page.on("request")` recorder that collects the PUT bodies,
with each test polling for the **specific** persist it cares about (PORTING's
"key a retroactive recorder on WHICH response, never a count"):
- test 1: a body whose `theme.colors.brand` is pure red;
- test 2: a body whose `theme.id` equals the seeded theme's id.

Mutation-confirmed discriminating (M4 below). Strictly stronger than the
original.

### 2. `H.getSimpleEmbedIframeContent()` is a gate, not an accessor

Same point `select-embed-options` recorded: the Cypress helper retries on
`iframe[data-metabase-embed]` **and** `iframe[data-iframe-loaded]` before
scoping in. Ported as a local `firstPreviewCell()` that awaits
`waitForSimpleEmbedIframesToLoad` first, re-run at each use site (the wizard
re-mounts the preview when the theme changes).

---

## Mutation / vacuity results (all on the jar)

| # | mutation (input inverted) | expected | observed |
| --- | --- | --- | --- |
| M1 | type `rgb(0, 255, 0)` instead of red | test 1 dies at the FIRST css assertion | **killed** — and the log shows the real transition `rgb(80, 158, 226)` → `rgb(0, 255, 0)`, so the colour path is genuinely exercised |
| M2 | keep red, then `PUT …/sdk-iframe-embed-setup-settings {value: null}` after the persist wait | test 1 dies at the **FINAL** (post-reopen) assertion only | **killed** at line 247, received `rgb(80, 158, 226)` — the persistence round-trip is what makes step 3 pass |
| M4 | persist predicate `theme.id === savedTheme.id + 999` | test 2 times out in `waitForPersist` | **killed** (20s predicate timeout) |

Two **positive-presence probes** for the absence assertion in
`assertPreviewFinishesLoading` (`preview-loading-indicator` → `toHaveCount(0)`),
because absence checks are the vacuity risk here:

- **M3b** — assert the loader IS visible right after the theme-card click:
  **passes**. The loader really mounts and later clears.
- **M5** — assert the loader IS visible right after `reopenNewEmbedModal`:
  **passes**. This is the regression path itself (#77150, "stuck loader when
  reopening with a saved theme"): the overlay mounts on reopen and then clears.

So the absence assertion is discriminating on both legs, not satisfied by "the
overlay never rendered". M1 and M2 between them cover test 1's first and last
assertions separately, which is why no extra targeted mutation was needed there.

---

## Notes / non-claims

- **No product-bug claims. Nothing fixme'd.** No Cypress cross-check was needed
  — nothing failed.
- The jar (built 2026-07-17) postdates the fix commit `951be524ecf` (2026-07-08)
  that added test 2, so the regression test is meaningful on this artifact
  rather than testing an unfixed build. I confirmed the jar's FE bundle carries
  the `theme-card-` / `embed-theme` surface; I did **not** byte-verify the
  `setEmbedElementRef` fix itself in the minified bundle — the date ordering
  plus the test passing is the evidence, and M5 shows the loader path runs.
- **Snowplow is absent from this spec entirely** — no `H.enableTracking()`, no
  event assertions, no `expectNoBadSnowplowEvents`. Unlike its Group B siblings
  it therefore installs **no** capture. Worth noting because the siblings' habit
  of always installing `installSnowplowCapture` is a *port* of their explicit
  `enableTracking()`; copying it here would have added backend state upstream
  does not set.
- `H.mockEmbedJsToDevServer()` is not called by this spec at all — it appears to
  be the only spec in the tier that omits it, so there was nothing to drop.
- Runtime is ~4s/test; no flake seen across 6 total executions of each test
  (verification + repeat-each + mutation runs).
