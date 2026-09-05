# sdk-iframe-embedding-setup — shared helper + proof spec

Slot 5 (:4105), jar mode (`version.hash` = `751c2a9`, matching
`target/uberjar/COMMIT-ID` `751c2a98`).

Deliverables: `support/sdk-embed-setup.ts` (helper),
`tests/sdk-embed-setup-get-code.spec.ts` (proof spec, **14/14 green, 28/28
under `--repeat-each=2`, 0 gate-skipped**), `bunx tsc --noEmit` clean.

This continues `findings-inbox/sdk-iframe-harness.md` §5's Group B. Its
structural claim holds up completely: none of the 13 specs in
`sdk-iframe-embedding-setup/` builds a customer HTML page or loads `embed.js`.
They are admin-UI tests that visit `/admin/embedding`, click "New embed", and
drive the wizard inside a full-screen Mantine modal.

---

## 1. What the helper covers

Port of `e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/helpers/index.ts`
(200 lines) plus the two `e2e-embedding-iframe-sdk-setup-helpers.ts` helpers
those specs reach for through `H`.

| upstream | ported as | status |
| --- | --- | --- |
| `getEmbedSidebar` | same | proven (14 tests) |
| `getResourceSelectorButton` | same | proven (probe) |
| `codeBlock` | same | proven (10 assertions) |
| `visitNewEmbedPage` | same, `{ waitForResource }` | proven both branches |
| `navigateToEntitySelectionStep` | same | proven: `dashboard`, `chart`, `exploration`, `browser`, `metabot`; `preselectSso` and `preselectGuest` |
| `navigateToEmbedOptionsStep` | same | proven |
| `navigateToGetCodeStep` | same | proven (14 tests) |
| `completeWizard` | same | **ported, unexercised** — see §4 |
| `assertRecentItemName`, `assertDashboard` | same, over an awaited body | mechanism proven; see §2 |
| `H.embedModalEnableEmbedding` | same | proven (every navigation goes through it) |
| `H.embedModalContent`, `H.embedModalEnableEmbeddingCard` | same | proven |
| — | `waitForWizardDashboard`, `waitForRecentActivity` | new; the rule-2 arming half of the two alias assertions |
| — | `logRecent` | new; extracted from the identical spec-local copy in select-embed-entity / select-embed-experience |
| `mockEmbedJsToDevServer` | **dropped** | doubly inert here — the wizard preview imports the embed runtime directly (`SdkIframeEmbedPreview.tsx`) and never fetches `embed.js` |

`support/sdk-iframe.ts` is consumed **read-only** and needed no changes. The
wizard's in-app preview still produces a real `iframe[data-metabase-embed]`, so
`getSimpleEmbedIframe` / `waitForSimpleEmbedIframesToLoad` / `enableJwtAuth` /
`enableSamlAuth` all work unmodified from this tier. That is now demonstrated,
not assumed (2 tests in the proof spec).

## 2. Two deviations, both forced, both recorded

**(a) The alias-reading assertions are inverted.** `assertRecentItemName` and
`assertDashboard` upstream read a `cy.intercept(...).as()` alias registered in
a `beforeEach`. Playwright has no retroactive alias (PORTING.md rule 2), so
they became pure assertions over an already-awaited body, and the spec arms
`waitForRecentActivity` / `waitForWizardDashboard` before the navigation.
Mechanically weaker in no way — arguably stronger, since a `cy.get("@alias")`
whose request never fired dies with a confusing "no alias" error at an
arbitrary later point.

**(b) `embedModalEnableEmbedding` needed a settle gate.** Upstream is a
one-shot `cy.get("body").then($body => …)` probe: no `enable-embedding-card`
mounted ⇒ terms already accepted ⇒ no-op. Cypress gets the settle for free from
its command queue (the preceding `.click()` must resolve first); Playwright
fires back-to-back, so the count could run before the modal mounted and
silently skip a *needed* click. The port waits for
`sdk-iframe-embed-setup-modal-content` — present in **both** branches, so it
does not bias the probe — before counting. Without it the damage surfaces far
away, as "the preview iframe never loaded".

Everything else in the helper is a literal translation, including upstream's
`ensureAuthMode` subtlety (never treat the disabled "Enabled" label as a
terminal no-op; it also appears transiently on the *stale* section before React
unmounts it).

## 3. Proof spec: why `get-code`, and its numbers

`select-embed-options.cy.spec.ts` (1027 lines) is the biggest, but it is the
*wrong* proof. It calls only `navigateToEmbedOptionsStep`, only for
`dashboard`/`chart`. `get-code.cy.spec.ts` (289 lines, 14 tests) is the only
spec in the tier that calls `navigateToGetCodeStep` — the deepest link — so it
drives the **entire chain** 14 times over three experiences and both auth
presets, exercises both locator helpers, and is the only setup spec that also
touches the iframe harness. Roughly a third of the cost for strictly more
helper coverage.

- **14 executed, 0 gate-skipped.** No `test.skip`, no token gate. The
  `pro-self-hosted` token is active as upstream sets it.
- **28/28 under `--repeat-each=2`**, 54.8s. Single run 27.2s.
- **Mutation-checked (5 assertions corrupted: dashboard-id, `metabase-question`,
  `entity-types`, a snowplow `event_detail`, and a `toBeDisabled`). Exactly
  those 5 tests failed and no others.** Non-vacuous.
- **Snowplow is the subject, not incidental** — 5 tests assert `embed_wizard_*`
  events and `afterEach` asserts no bad events. Rule 6's stub-to-no-op branch
  would have deleted that coverage, so this uses `installSnowplowCapture`
  (browser-boundary capture, no micro container). The `authSubType=sso`
  mutation failing is the direct evidence the capture is live. **This is the
  first use of that capture outside the search/visualizer specs, and it works
  unchanged on the embed wizard** — which de-risks the rest of the tier, since
  snowplow assertions are pervasive here.
- **Free anti-#39 evidence.** The generated snippet the tests assert on
  literally contains `"instanceUrl": "http://localhost:4105"` (visible in the
  mutation-run diff output). The wizard reads `instanceUrl` from the `site-url`
  setting, which `fixtures.ts restore()` re-points per slot, so these tests
  cannot silently pass against :4000 — the code block would carry the wrong
  origin. No extra guard needed for this tier.

**No product-bug claims from this port.** Nothing was fixme'd. Every fix during
stabilisation was in my own port.

## 4. What the helper does NOT cover

- **`completeWizard` is dead code upstream** — defined in `helpers/index.ts`,
  imported by zero specs. A probe showed why: "Done" is
  `disabled={resource?.enable_embedding === false}`
  (`SdkIframeEmbedSetupModal.tsx`) and the sample "Orders in a dashboard" has
  embedding disabled, so on the SSO path it renders permanently disabled
  ("element is not enabled" for the full 20s). Ported for completeness and
  documented at the call site. **Not a bug claim** — no spec asserts otherwise,
  and the guest path may well enable it.
- **The `metabot` experience needs `llm-anthropic-api-key` set.** The
  experience card is gated on `useMetabotEnabledEmbeddingAware`; without the
  setting the card never renders and `navigateToEntitySelectionStep({
  experience: "metabot" })` times out looking for it. This is spec-level setup,
  not a helper gap — `select-embed-options`'s beforeEach sets
  `H.updateSetting("llm-anthropic-api-key", "sk-ant-test-key")`, and it is the
  only spec using that experience. **Whoever ports `select-embed-options` must
  carry that line**, or 2 of its tests fail in a way that looks like a helper
  bug.
- The guest-embed prepare path (`prepare*Guest*`) is untouched — it belongs to
  `sdk-iframe.ts`'s tier and is still unported (harness findings §2).
- Snowplow **Iglu schema validation** is still unavailable (the known
  `expectNoBadSnowplowEvents` downgrade recorded in `search-snowplow.md`).

## 5. REVISED estimate for the remaining 12 — the prior estimate was too high

The prior estimate was "1 session for the helper, then **4-5** to fan out". The
helper session is done and cost well under a session (the helper is ~200 lines
of mechanical translation; the only two judgement calls are in §2). **I think
4-5 fan-out sessions is roughly 2× too many.** Revised: **2-3 sessions.**

The reasoning, which is now evidence rather than sizing:

1. **The navigation chain is the whole spec.** Every one of the 12 opens with
   `navigateTo*Step(...)` and then asserts on the sidebar or the code block.
   That was the entire risk surface, and it is now green across all five
   experiences and both auth presets. What is left per spec is assertion
   translation, which is fast and low-variance.
2. **The snowplow question is settled.** It was the second-largest unknown —
   these specs are dense with `expectUnstructuredSnowplowEvent` — and
   `installSnowplowCapture` drops in unchanged. That removes what would
   otherwise have been a per-spec investigation.
3. **Line counts overstate the work.** `select-embed-options` is 1027 lines but
   21 near-identical `navigateToEmbedOptionsStep` → toggle a switch → assert the
   code block cycles. It is the one spec I would still give its own session.
4. **Runtime is cheap** — 14 wizard tests in 27s on the jar, ~2s each including
   restore. Iteration is not the bottleneck.

Proposed shape:

| session | specs | lines |
| --- | --- | --- |
| A | `select-embed-options` alone | 1027 |
| B | `guest-embed-ee`, `guest-embed-oss`, `embed-parameters-remapping`, `embed-parameters` | 1353 |
| C | `select-embed-entity`, `select-embed-experience`, `common-ee`, `embed-flow-enable-embed-js-ee`, `embed-flow-enable-embed-js-oss-and-starter`, `common-oss-and-starter`, `user-settings-persistence` | 1336 |

Sessions B and C are the ones I would happily merge if the box has slots free;
C in particular is seven small specs with almost no novel surface.

Two caveats on that estimate, stated rather than buried:

- The four `*-oss*` / `*-ee` / `*-starter` specs vary the licence tier
  (`@OSS`-tagged describes, `activateToken("starter")`, "EE without license").
  Per FINDINGS #49 these should be **run, not reflexively skipped** — an `@OSS`
  describe usually runs fine on the EE jar with no token active. I have not
  verified that for this tier, so it is the one thing that could add a session
  if the tier gating turns out to be real.
- `guest-embed-*` (713 lines across two) is the only pair that touches the
  guest path, which the wizard exposes through the `Guest` auth radio. My probe
  proved `preselectGuest` reaches the entity-selection step; it did not go
  further into guest-specific assertions.
