# sdk-iframe-embedding-setup / guest-embed-oss — port

Slot 4 (:4104), jar mode (`version.hash` = `751c2a9`, matching
`target/uberjar/COMMIT-ID` `751c2a98`).

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/guest-embed-oss.cy.spec.ts`
(295 lines, 1 test).
Target: `tests/sdk-embed-setup-guest-embed-oss.spec.ts`. **No new support
module** — see §3.

**1/1 executed and passing, 0 gate-skipped, 0 fixme. 2/2 under `--repeat-each=2`
(6.5s), reproduced on two consecutive runs. `bunx tsc --noEmit` clean.**
Green on the first run; no stabilisation fixes were needed, so nothing to
classify under the feedback-loop rule.

Three-line summary:
1. **The flagged hazard does not exist.** The EE sibling's "the flow dies inside
   `visitNewEmbedPage` on an EE jar without a token" did not reproduce — probed
   before writing any code. `restore()` clears the token (42 features → 0) and
   the whole guest wizard runs feature-less in 1.4s.
2. **Nothing is gated.** The tier split is an assertion gate, exactly as the EE
   findings predicted; a `test.skip` would have deleted all six distinguishing
   assertions. 1/1 executed.
3. **11 mutations killed**, all at the intended line, including every assertion
   that differs from the EE sibling.

---

## 1. The no-token-on-an-EE-jar hazard: probed, did not reproduce

`findings-inbox/sdk-embed-setup-guest-embed-ee.md` §1 reported that removing
`activateToken` from the EE spec killed the flow inside `visitNewEmbedPage`'s
admin-page click after 31.6s, and named that the single risk of this port. I
probed it directly on slot 4 (throwaway spec, since deleted) before writing the
port. Measured, on the jar:

| probe | result |
| --- | --- |
| `restore()` after a `pro-self-hosted` activation | enabled `token-features` **42 → 0** |
| `version.tag` / `version.hash` | `vUNKNOWN` / `751c2a9` (the EE jar) |
| `/admin/embedding` testids | `sdk-setting-card` **0**, `guest-embeds-setting-card` **1**, one "New embed" button |
| `enable-embedding-static` (default snapshot) | `true` |
| `visitNewEmbedPage(page)` | **OK, 1.4s** |
| Guest radio | already **checked** |
| `upsell-card` | 1 in the sidebar, 1 page-wide |
| SSO / Exploration / Browser radios | present and **disabled** |

So the port needs **no** workaround: not `deleteToken`, not a describe gate, not
a shared-helper change. Mechanism, for the record — with `embedding_simple`
absent, `EmbeddingSettings.tsx` renders `EmbeddingSettingsOSS` →
`SharedCombinedEmbeddingSettings`, which still mounts a `NewEmbedButton` (with
`forceIsGuest`) inside `guest-embeds-setting-card`. The shared helper's
`getByTestId(/(sdk-setting-card|guest-embeds-setting-card)/)` already covers
both branches, which is exactly why it works unchanged.

I did **not** reproduce the EE agent's failing probe, so I can't say what it hit;
I am not claiming their observation was wrong, only that on this slot, on this
jar, with `restore()` doing the token-clearing, it is not reachable. Stated
rather than buried: the difference between our two probes is unexplained.

**Token hygiene.** The port never activates a token and `restore()` clears any
left by a sibling spec, so the slot is left feature-less by construction —
verified with a post-run `GET /api/session/properties` (0 enabled features) and
two consecutive full runs. Because "we didn't activate one" is not evidence on a
shared slot (the inverse of PORTING's `activateToken`-doesn't-throw warning), the
`beforeEach` now **asserts** the precondition:
`expect(enabledFeatures, "no token features active (@OSS)").toEqual([])`. That
is the only assertion in the port that upstream does not have; it is a
precondition guard, not new coverage.

## 2. The tier split — nothing gated, and why that matters here

Confirmed the EE findings' characterisation independently. `-oss` is
`{ tags: "@OSS" }` and omits `activateToken`; everything else is the same flow
with **opposite** expectations at six points:

| point | `-ee` | `-oss` (here) |
| --- | --- | --- |
| entity-step `upsell-card` | count 0 | **visible** |
| options-step `upsell-card` | count 0 | **exists** |
| "Allow downloads" | enabled, unchecked | **disabled and checked** |
| preview `embedding-footer` | count 0 | **visible** |
| final embed page `embedding-footer` | count 0 | **visible** |
| Guest radio | must be clicked (+ terms re-accept) | already the default |
| SSO / Exploration / Browser | selectable | **disabled** |

A reflexive `test.skip(!isOssBackend(mb.api))` would have skipped the only test
in the file and deleted every row above. **0 gate-skipped, 1 executed.**

Note the vacuity direction is *inverted* relative to the EE sibling. There the
tier assertions were `count === 0` — the canonical vacuous-pass shape, needing a
dedicated probe. Here they are positive (`toBeVisible` / `toBeChecked` /
`toHaveCount(1)`), which cannot pass on an unrendered scope. The pair is
therefore mutually non-vacuous by construction: the same locator at the same
instant is asserted present by one spec and absent by the other, and both pass.
That is a stronger statement than either spec makes alone, and it is worth
saying out loud as the reason this pair should never be collapsed or skipped.

## 3. No new support module, and no shared-module edits

The brief provisioned `support/sdk-embed-setup-guest-embed-oss.ts`. It is not
needed and was not created: the pair's only spec-local helper is
`capturePreviewEmbedRequests`, which the EE sibling already exports from
`support/sdk-embed-setup-guest-embed-ee.ts`, and this spec imports it from
there. Adding a second module holding a re-export would be pure ceremony.

Consumed **read-only and unmodified**: `support/sdk-embed-setup.ts`,
`support/sdk-iframe.ts`, `support/embedding-dashboard.ts`,
`support/factories.ts`, `support/notebook.ts`, `support/search-snowplow.ts`,
`support/sdk-embed-setup-guest-embed-ee.ts`. **`support/sdk-embed-setup.ts`
needs no change for the OSS path** — which is now the third independent spec to
say so.

Cross-file note for whoever consolidates: `capturePreviewEmbedRequests` now has
two consumers and lives in a file named after only one of them. If a third
Group B spec wants it, promote it to `support/sdk-embed-setup.ts` rather than
copying — but that is a consolidation decision, not this port's to make.

## 4. Non-vacuity — 11 mutations, 11 killed, each at the intended line

One test, so each mutation was run on its own (any mutation reddens the whole
test; only the reported line distinguishes them). Every failure landed at the
mutated assertion and the unmutated run is green before and after.

| # | mutation | failed at |
| --- | --- | --- |
| 1 | entity-step `upsell-card` `toBeVisible` → `toHaveCount(0)` | :223 |
| 2 | SSO/Exploration/Browser `toBeDisabled` → `not.toBeDisabled` | :220 |
| 3 | "Allow downloads" `toBeChecked` → `not.toBeChecked` | :271 |
| 4 | options-step `upsell-card` `toHaveCount(1)` → `(2)` | :292 |
| 5 | preview `embedding-footer` `toBeVisible` → `toHaveCount(0)` | :303 |
| 6 | light-theme download-widget bg `rgb(255,255,255)` → `…254` | :308 |
| 7 | dark-theme download-widget bg `rgb(7,23,34)` → `…35` | :318 |
| 8 | snowplow `withDownloads=true` → `false` | :334 |
| 9 | code-block theme regex `"dark"` → `"light"` | :345 |
| 10 | `x-metabase-embedded-preview` `"true"` → `"false"` | :358 |
| 11 | final embed-page `embedding-footer` `toBeVisible` → `toHaveCount(0)` | :385 |

Mutations 1, 3, 5 and 11 are the four tier-distinguishing assertions the EE
sibling asserts in the opposite direction. Mutation 7 additionally proves the
appearance-step click reaches the *preview iframe* (a cross-document effect),
and 9 proves it reaches the generated snippet.

**Free anti-#39 evidence**, same as the two sibling ports: the code block the
test reads carries `"instanceUrl": "http://localhost:4104"`, so this test cannot
silently pass against :4000.

## 5. Deviations from a literal transcription (all narrow, all recorded)

- **`cy.intercept("GET", "api/preview_embed/card/*")` → passive recorder.** Same
  reasoning as the EE sibling: registered at the top of the test and read ~120
  lines later, and `cy.wait` consumes a *past* response. An armed
  `waitForResponse` at the read site would hang. Proven live by mutation 10.
- **`.scrollIntoView()` dropped** before the three `should("be.visible")` options
  assertions. Playwright's `toBeVisible()` does not require the element to be in
  the viewport (PORTING's `toBeInViewport` note is the same fact from the other
  side), so the scroll cannot affect the assertion, and the later clicks
  auto-scroll. Dropping it is not a weakening; keeping it would have been noise.
- **`codeBlock().invoke("text").should("match", …)` → `expect.poll(() =>
  …innerText()).toMatch(…)`.** `should("match")` is retrying, so a one-shot
  `innerText()` read would have been *weaker*; `toHaveText` was avoided because
  it normalises whitespace, which the `\s*` in the regex is there to span.
- **Entity-picker question click scoped to `item-picker-level-1`**, matching the
  shared helper and the EE sibling. Upstream's unscoped `findByText` is
  unique-by-construction (testing-library throws on multiple matches), so this is
  a strict narrowing that cannot change which element is picked — it only removes
  a strict-mode hazard from the recents list. Upstream's ordering is otherwise
  preserved: `-oss` asserts "Select a chart" *before* clicking "Our analytics"
  (the `-ee` spec does it after), and that order is kept.
- **`cy.findAllByTestId("parameter-widget").find("input").type(…)` →
  `.first().fill(…)`.** `cy.type` refuses a multi-element subject, so upstream
  resolves to exactly one input; `.first()` is that element. Proven sufficient by
  the "Foo Bar Baz" assertions in both the preview and the real embed page.
- **The duplicated disabled-checks loop is kept verbatim.** Upstream asserts the
  three options switches disabled individually and then re-asserts the same three
  in a `forEach`. That is redundant upstream too; merging them would be
  cleverness over faithfulness, so both survive.
- **The unused fixture aliases are dropped, not the fixtures.** Upstream wraps
  `dashboardId` / `question1Id` / `question2Id`; this spec's single test reads
  none of them (the EE sibling's tests 2 and 3, which do, have no `-oss`
  counterpart). The three creations are kept — they are the entity picker's
  content — but nothing captures the ids.
- `H.enableTracking()` → `updateSetting("anon-tracking-enabled", true)`;
  `H.resetSnowplow()` / `H.expectNoBadSnowplowEvents` → the capture's structural
  equivalent (Iglu validation still unavailable — the known downgrade).
- `H.mockEmbedJsToDevServer()` dropped (jar serves the real asset; the wizard
  preview never fetches it).

## 6. Incidental observation: the EE build emits an upsell event upstream's OSS build cannot

Visible in the mutation-8 diagnostic dump, the captured snowplow stream contains
`{"event":"upsell_viewed","promoted_feature":"dev_instances","upsell_location":"embedding-page"}`
— `EmbeddingSettingsPageWrapper` renders `UpsellDevInstances` under
`PLUGIN_IS_EE_BUILD.isEEBuild()`, which is true on our jar and false on the OSS
build CI runs this spec against. **It changes nothing here**: the event
assertions are matcher-based (extra events are ignored),
`expectNoBadSnowplowEvents` is structural, and the page-wide `upsell-card` count
is still exactly 1 (that banner is an `UpsellBanner`, a different component,
without the `upsell-card` testid) — mutation 4 confirms the count is live at 1.
Recording it because it is the one place where "EE jar with no token" is
observably *not* identical to an OSS build, and a future port that counts
upsells page-wide on this page will trip over it.

Not a product-bug claim, and nothing was fixme'd.

## 7. Not verified — stated rather than buried

- **No Cypress cross-check was run.** Nothing failed: the port was green on the
  first run, and per FINDINGS #31 the cross-check establishes fidelity for
  *claims*, of which this port makes none.
- **`completeWizard` remains dead code and remains unexercised**, on the OSS
  guest path as on the EE one. This spec never clicks "Done". The
  `findings-inbox/sdk-embed-setup.md` §4 speculation that "the guest path may
  well enable it" is still neither confirmed nor refuted. Not a bug claim.
- **The `metabot` trap did not apply** — this spec uses only the `chart`
  experience, so `llm-anthropic-api-key` was never needed. The warning still
  stands for `select-embed-options`.
- **`snowplow-micro` was never running**; the browser-boundary capture is the
  only snowplow mechanism used, so the Iglu-validation gap is inherited.
- **No product-bug claims. Nothing skipped, nothing fixme'd, no shared module
  touched.**
