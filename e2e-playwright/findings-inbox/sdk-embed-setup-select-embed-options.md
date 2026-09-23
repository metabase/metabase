# select-embed-options — the largest setup-wizard spec

Slot 1 (:4101), jar mode. Backend verified: `/api/session/properties`
`version.hash` = `751c2a9`, matching `target/uberjar/COMMIT-ID` `751c2a98`.

Deliverables:
- `tests/sdk-embed-setup-select-embed-options.spec.ts` (port of
  `e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/select-embed-options.cy.spec.ts`,
  1027 lines)
- `support/sdk-embed-setup-select-embed-options.ts` (3 spec-local helpers)
- `support/sdk-embed-setup.ts` consumed **read-only and unmodified**.

## Numbers

- **21 executed, 21 passed. 0 skipped, 0 fixme, 0 gate-skipped.**
- **63/63 under `--repeat-each=3`** (2.4m). Also 42/42 under `--repeat-each=2`.
- `bunx tsc --noEmit` clean.
- Single run: 48.7s for 21 tests (~2.3s/test), matching the Group B estimate.
- **No product-bug claims.** Every fix during stabilisation was in my own port.

## Tier gating: NOT real (FINDINGS #49, executed vs gate-skipped)

The spec has three top-level describes. Following the "do not gate by reflex"
rule I ran all three rather than skipping:

| describe | token in beforeEach | result |
| --- | --- | --- |
| `describe("OSS", { tags: "@OSS" })` | none | **2/2 executed and passed on the EE jar** |
| `describe("EE without license")` | `activateToken("starter")` | **1/1 executed and passed** |
| main suite | `activateToken("pro-self-hosted")` | **18/18 executed and passed** |

The `@OSS` tag is not load-bearing here. The three assertions are all
"`upsell-card` is visible", and `EmbeddingUpsell` renders whenever
`isSimpleEmbedFeatureAvailable` is false — which is the state of the EE jar
with no token *and* with the starter token. No `isOssBackend` gate is needed
and none was added. `MB_STARTER_CLOUD_TOKEN` is present in the repo-root
`cypress.env.json`, so the starter describe runs unconditionally too.

This closes one of the two caveats the Group B findings left open (§5): tier
gating in this spec is **not** a real cost. It says nothing about the other
three `*-oss*`/`*-ee`/`*-starter` setup specs, which remain unverified.

## The one dividend-shaped thing, and it goes AGAINST the playbook

PORTING.md's batch-8–11 rule says `should("not.exist")` is a one-shot absence
check and should be matched with a **non-retrying**
`expect(await loc.count()).toBe(0)`, warning that a retrying `toHaveCount(0)`
is stronger than the original and "may legitimately go red".

Ported that way first, this spec **flaked in the other direction**: 1 failure
in 36 executions of `toggles chart title for charts` (the first `repeat-each=2`
run; every isolated re-run and two subsequent `repeat-each=3` full runs were
green, and `test-results/` had been wiped by a sibling agent before I could
read the error context, so I do not have the exact assertion).

Why the non-retrying form is the wrong shape *for this spec specifically*:
every one of its 14 absence checks sits immediately after an embed-option
toggle, and the wizard re-renders the preview **in place** rather than
remounting the iframe. So `embedPreview()`'s "iframe has loaded" gate does not
cover the re-render, and a count read the instant after the toggle can still
observe the outgoing DOM. All 14 are **steady-state** absences (the chart title
stays hidden while the switch is off; `export-as-pdf-button` stays absent while
downloads are off), so `toHaveCount(0)` cannot go red for a legitimate reason.

All 14 were converted to retrying `toHaveCount(0)` and documented in the spec
header as a deliberate strengthening. **Suggested amendment to the PORTING rule:**
the non-retrying form is right when the absence is *momentary* (a popover that
might appear late); when the absence is the steady state and the preceding
action mutates the DOM being scanned, the non-retrying form is a flake
generator, not fidelity. Worth stating both halves in the rule.

## Mutation check (non-vacuity)

Five assertions corrupted in one run; **exactly the four expected tests failed
and no others**:

| mutation | test that failed |
| --- | --- |
| tooltip text `Guest Mode` → `MUTANT …` | cannot select subscriptions … |
| `getByText("Orders in a dashboard")` absence → `getByText("Subtotal")` (present) | toggles dashboard title … |
| snowplow `withDownloads=true` → `withDownloads=false` | toggles downloads for charts |
| `data-layout="stacked"` → `"stackedMUTANT"` | can toggle the Metabot layout … |

A fifth mutation (swapping the `Save` absence check to `getByText("Orders")`)
was a **bad mutation** — that exact string is not in either preview — so it
proved nothing. Replaced with a direct probe: re-asserting the `Save` absence
*after* enabling the save option failed both `toggles save button for
exploration` and `… for chart`. The negative preview assertions are live.

The snowplow mutation failing is direct evidence `installSnowplowCapture` is
capturing on this spec too. That is now **seven** specs on the helper unchanged.

## Deviations, all forced, all recorded

1. **`H.setupSMTP()` → `configureSmtpSettings(mb.api)`** (support/admin-extras.ts).
   The Cypress helper PUTs `/api/email`, which live-validates the SMTP
   connection against the maildev container. The three tests that call it only
   need the "email is configured" state — they never send or read mail — so the
   settings go through `PUT /api/setting`, which skips validation and needs no
   container. This is what keeps the spec container-free. **Not** the
   `onboarding-extras.setupSMTP` port, which does need maildev (and would have
   gate-skipped or hung; see the maildev-3.x note in PORTING.md for how that
   failure mode reads as green).
2. **The two `cy.button("Back")` clicks in a row needed a gate.** Both the
   get-code and embed-options steps label the button "Back", so back-to-back
   Playwright clicks can land on the same step (Cypress's command queue paced
   them apart). Gated the second click on `Get code` being visible, i.e. on the
   embed-options step having rendered. Two tests.
3. **`.trigger("mouseenter"|"mouseover")` → `dispatchEvent(...)`, not `hover()`.**
   Cypress's `.trigger()` defaults to `{ bubbles: true }`, which is what makes
   React's delegated `onMouseEnter` fire. A real `hover()` would reintroduce the
   hit-testing problem the upstream comment describes (the info icon sits beside
   a *disabled* input — this is the `database-routing-admin` tooltip class of
   bug). Both the Mantine `Tooltip` and the `HoverCard` branch of
   `TooltipWarning` respond to the dispatched event.
4. **`.closest("[data-testid=tooltip-warning]")` → `getByTestId(...).filter({ has: … })`**,
   with the `has:` sub-locator built from `page` rather than from the sidebar
   Locator (the wave-11 re-anchoring gotcha).
5. **`cy.wait("@persistSettings")`** in `derives colors for dark theme palette`
   is armed (rule 2) immediately after navigation, before the theme edits that
   trigger the debounced persist, and awaited at the end. The upstream comment
   about `useUserSetting`'s orphaned debounce polluting the *next* test is
   carried over verbatim; the port needs it for the same reason.
6. The two never-awaited `cy.intercept(...).as("dashboard"|"cardQuery")` in all
   three `beforeEach`es are dropped (rule 2).

## Traps from the brief, confirmed

- **`llm-anthropic-api-key` is required** for the two `metabot` tests. Carried
  in the main describe's `beforeEach`, as flagged. Confirmed working.
- **`completeWizard` is dead code upstream** — this spec does not call it, so
  nothing here touches it. No change requested to `support/sdk-embed-setup.ts`.

## `support/sdk-embed-setup.ts` needs NO changes

Three spec-local helpers went into
`support/sdk-embed-setup-select-embed-options.ts` instead:

- **`embedPreview(page)`** — the port of `H.getSimpleEmbedIframeContent()` as an
  `async` gate. This matters and is easy to get wrong: the Cypress helper is not
  an accessor, it *asserts* (retrying) that both `iframe[data-metabase-embed]`
  and `iframe[data-iframe-loaded]` exist before scoping in. So every
  `H.getSimpleEmbedIframeContent().findByX().should("not.exist")` in the
  original asserts TWO things, and a port that reaches straight for
  `getSimpleEmbedIframe(page)` keeps only the half that passes trivially on a
  blank preview. (Same shape as the batch-8–11 "implicit existence assertion"
  rule, but hidden inside a helper rather than visible in the chain.)
- **`optionSwitch` / `toggleOptionSwitch`** — the wizard's Mantine `Switch`
  inputs are visually hidden, so `click({ force: true })` (rule 4).
- **`tooltipWarningInfoIcon`** — deviation 4 above.

`support/INDEX.md` was **not** regenerated (`scripts/build-helper-index.mjs` is
off-limits per the brief) — one entry for the new module is owed at the next
consolidation pass. `PORTED.txt` / `QUEUE.md` likewise untouched;
`select-embed-options.cy.spec.ts` is ready to be added.

## Reuse notes for the remaining setup specs

Nothing in this port needed a new cross-cutting mechanism. Existing modules
consumed read-only: `sdk-embed-setup` (all navigation), `sdk-iframe`
(`getSimpleEmbedIframe`, `waitForSimpleEmbedIframesToLoad`), `search-snowplow`
(capture), `embedding-dashboard.publishChanges`, `admin-extras.configureSmtpSettings`,
`filters-repros.findByDisplayValue`, `charts.tooltip`, `filter-bulk.hovercard`,
`ui.popover`, `factories.createQuestionAndDashboard`, `sample-data.SAMPLE_DATABASE`.

That the 1027-line spec cost one uneventful pass supports the Group B findings'
revised "2–3 sessions" estimate for the tier rather than the original 4–5.

## Three-line summary

Ported 21/21 green on the jar, stable at `--repeat-each=3` (63/63), tsc clean,
zero skips and zero fixmes; the `@OSS` and `EE without license` describes both
run fine on the EE jar, so tier gating in this spec is not real.
No product bugs; the one real finding is a **counter-example to PORTING.md's
`should("not.exist")` rule** — the prescribed non-retrying port flaked 1-in-36
here because every absence follows an in-place preview re-render, and the
retrying `toHaveCount(0)` is both correct and stronger for steady-state absences.
