# sdk-iframe-embedding-setup / guest-embed-ee — port

Slot 4 (:4104), jar mode (`version.hash` = `751c2a9`, matching
`target/uberjar/COMMIT-ID` `751c2a98`).

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/guest-embed-ee.cy.spec.ts`
(420 lines, 3 tests).
Target: `tests/sdk-embed-setup-guest-embed-ee.spec.ts`, plus a 50-line
`support/sdk-embed-setup-guest-embed-ee.ts`.

**3/3 executed and passing, 0 gate-skipped, 0 fixme. 6/6 under
`--repeat-each=2` (20.7s). `bunx tsc --noEmit` clean.**

Three-line summary:
1. Group B's guest path works end to end on the shared helper — `preselectGuest`
   goes all the way to Get code, publish/unpublish, and a real guest-token embed
   page. `support/sdk-embed-setup.ts` needed **no** changes.
2. The EE tier gate is **real and behavioural**, but it is not a describe-level
   gate — nothing to `test.skip`, so all 3 tests execute.
3. `prepareGuestEmbedSdkIframeEmbedTest` — the gap the brief expected to land
   here — **is not needed by this spec at all**. See §3.

---

## 1. Is the EE tier gate real? Yes, and it is an ASSERTION gate, not a describe gate

Checked rather than assumed, per FINDINGS #49.

- `guest-embed-ee.cy.spec.ts` carries **no tag**. Its entire EE-ness is one line:
  `H.activateToken("pro-self-hosted")`.
- `guest-embed-oss.cy.spec.ts` is `{ tags: "@OSS" }` and simply omits the token.
- The split is **behavioural and load-bearing**: at the same two points, `-ee`
  asserts `upsell-card` does **not** exist and `-oss` asserts it **is visible**
  / **exists** (oss lines 139, 192). Same flow, opposite expectation.

So the right port is: activate the token, run everything, and add **no**
`test.skip`. A reflexive skip here would have silently deleted the only two
assertions that distinguish the two specs.

Two pieces of confirming evidence:

- The token genuinely activates on this slot — `GET /api/session/properties`
  reports 42 enabled `token-features`, including `embedding_simple`,
  `embedding_sdk` and `whitelabel`. `activateToken` throws on a missing env var,
  and it PUTs with `failOnStatusCode: false`, so "it didn't throw" alone would
  **not** have been evidence; the feature list is.
- **Probe: removing `activateToken` breaks the flow before it ever reaches the
  upsell assertion** (it dies inside `visitNewEmbedPage`'s admin-page click,
  31.6s). That is why there are two sibling specs rather than one parameterised
  one, and it confirms the token is doing real work rather than decorating a
  test that would pass either way. (Probe reverted; not shipped.)

## 2. Non-vacuity — 5 mutations killed, plus a dedicated vacuity probe

Corrupted assertions and confirmed exactly the intended tests went red:

| mutation | test | result |
| --- | --- | --- |
| `params={"locked":1}` → `"locked":2` in the `embed_wizard_options_completed` detail | 1 | ✘ at that assertion |
| `x-metabase-embedded-preview` expected `"true"` → `"false"` | 1 | ✘ at that assertion |
| final guest-embed-page text `Foo Bar Baz` → `Foo Bar Bazz` | 1 | ✘ at that assertion |
| `assertEmbeddingParameter("Text1", "Editable")` → `"Locked"` | 2 | ✘ (resolved input shows `value="Editable"`) |
| `toContainText("dashboard-id=")` → `"question-id="` | 3 | ✘ |

Run in three rounds so the two later test-1 mutations weren't masked by the
first. No unintended test failed in any round.

**The two `upsell-card` absence checks got their own probe**, because a
`.count() === 0` on a scope that failed to render is the canonical vacuous pass —
and these are precisely the tier-load-bearing assertions. Substituting a testid
known to be present at each instant (`embed-browse-entity-button` at the entity
step, `behavior-docs-link` at the options step) made each read `1` and fail. So
the sidebar locator is live at both instants and the zeros are real absences,
not an unrendered scope.

**Free anti-#39 evidence**, same as the get-code proof spec: the generated
snippet the test-3 assertions read literally contains
`"instanceUrl": "http://localhost:4104"` and
`src="http://localhost:4104/app/embed.js"` (visible in the mutation-run diff).
The wizard derives `instanceUrl` from `site-url`, which `fixtures.ts restore()`
re-points per slot, so these tests cannot silently pass against :4000.

## 3. `prepareGuestEmbedSdkIframeEmbedTest` is NOT needed here — correction to the harness findings

`findings-inbox/sdk-iframe-harness.md` §2 flags it as unported and "needed by 3
specs", and the brief routed it to this port. It does not belong here:

- Those three specs (`guest-embed`, `content-translations`,
  `guest-token-refresh`) are all in **`sdk-iframe-embedding/`** — Group A, the
  other tier.
- `guest-embed-ee.cy.spec.ts` (Group B) does not call it. It writes its own
  `beforeEach` inline (restore / admin / token / tracking / `embedding-secret-key`
  / three fixtures) and reaches the guest embed page through
  `H.loadSdkIframeEmbedTestPage({ metabaseConfig: { isGuest: true } })`, which
  `support/sdk-iframe.ts` **already supports unchanged** — `isGuest` is in its
  `MetabaseConfig` type and threads straight into `defineMetabaseConfig`. That
  path is now exercised for the first time and works.

So I did **not** add it (adding unused code to a module siblings will consolidate
is worse than the 20 lines it saves). It should stay on Group A's ledger. Also
worth noting for whoever picks it up: this spec never sets
`enable-embedding-simple` and the wizard works fine without it, so that flag is
not a prerequisite for the guest path.

**No shared-module edits.** `support/sdk-embed-setup.ts`,
`support/sdk-iframe.ts`, `support/embedding-dashboard.ts`,
`support/public-sharing-embed-button-behavior.ts` and `support/factories.ts`
were all consumed read-only and all worked unmodified. In particular
`getEmbedSidebar` / `visitNewEmbedPage` / `embedModalEnableEmbedding` /
`navigateToEmbedOptionsStep({ preselectGuest: true })` need nothing for guest.

## 4. What the guest path actually verified (the previously UNVERIFIED part)

The Group B findings said `preselectGuest` was only proven as far as the entity
step. It now goes considerably further, all green:

- Switching auth to Guest **mid-wizard** (radio click + the re-mounted terms
  section via `embedModalEnableEmbedding`), and switching **back** to
  `Metabase account (SSO)` two steps later with the terms re-accepted again —
  upstream's `ensureAuthMode` subtlety holds on the guest→SSO direction too.
- The Guest radio **disappears** from the options and get-code steps (both
  directions asserted).
- Guest-specific options-step state: drills disabled, downloads enabled and
  unchecked, save-new-questions disabled, and `behavior-docs-link` pointing at
  `embedding/guest-embedding`.
- The full **publish → unpublish → re-publish** cycle against `/api/card/:id`,
  including `publish-guest-embed-link` appearing only while unpublished, and
  "Copy code" existing only while published.
- Embedding-parameter **re-initialization across resource switches** (Back →
  pick a different question → Next), which is test 2's whole subject — locked
  state on question 2 does not leak onto question 1.
- The guest snippet's shape: `token=` present, and `dashboard-id=` /
  `hidden-parameters=` / `locked-parameters=` all **absent** (they are absent
  precisely because the guest token carries them), flipping to `dashboard-id=`
  with no `token=` after switching to SSO.
- End to end: the JWT extracted from the code block loads a **real guest embed
  page** (`loadSdkIframeEmbedTestPage`, `isGuest: true`) that renders the locked
  parameter's value and shows no embedding footer.

Five `embed_wizard_*` snowplow events are asserted with `installSnowplowCapture`
(rule 6's stub branch would have deleted them). This is now the **second** Group B
spec on that capture, again with zero modification to the helper.

## 5. The one fix needed while stabilising — mine, not the app's

First run: 2/3 green, 1 failure. `expect(await
sidebar.getByTestId("publish-guest-embed-link").count()).toBe(0)` immediately
after the second `publishChanges(page, "card")` read `1`, deterministically.

Classification: **port drift**, and a clean instance of a documented class.
Upstream's `should("not.exist")` is one-shot, so I ported it as a one-shot
count — correct — but Cypress's command queue supplies a settle between the
publish and the check that Playwright does not. `publishChanges` resolves on the
PUT *response*; the React re-render lands a tick later.

Fix: gate on the mirror state before the one-shot check — the empty state
carrying `publish-guest-embed-link` is replaced by the code block, so "Copy
code" visible ⟺ the link is gone, and upstream reaches that same state one
command later anyway. This does not weaken the assertion; the absence check is
still one-shot, it just happens at the instant Cypress's queue would have taken
it. Note the *preceding* absence check (after `unpublishChanges`) was already
gated this way by construction — it follows a retrying `toBeVisible()` on the
link — which is why only one of the four one-shot checks raced.

**Generalisable, worth adding to PORTING.md:** a one-shot `count() === 0` taken
straight after a helper that resolves on a *network response* is a race by
construction. Gate it on the mirror state (the element that replaces the one you
are asserting gone), not on a retrying `toHaveCount(0)` — that would be stronger
than the original.

## 6. Deviations from a literal transcription (all narrow, all recorded)

- **`cy.intercept("GET", "api/preview_embed/card/*").as("previewEmbed")` →
  passive recorder**, not an armed `waitForResponse`. PORTING.md rule 2 says arm
  before the trigger, but that is not what this pair does: the intercept is
  registered at the top of the test and read ~100 lines later, after the preview
  has already fetched, and `cy.wait` **consumes a past response**. An armed
  `waitForResponse` at the read site would hang waiting for a *new* request. The
  faithful shape is `page.on("request")` collecting matches from where upstream
  registers, read where upstream waits (`capturePreviewEmbedRequests`). Proven
  live by the `"true"` → `"false"` mutation.
- **Entity-picker clicks scoped to `item-picker-level-1`** in test 1, matching
  the shared helper. Upstream's unscoped `findByText` is unique-by-construction
  (testing-library throws on multiple), so this is a strict narrowing that cannot
  change which element is picked — it only removes a Playwright strict-mode
  hazard from the recents list. Tests 2/3 keep upstream's picker-wide
  `findAllByText(...).first()` shape.
- **`cy.findAllByTestId("parameter-widget").find("input").type(...)` →
  `.first().fill(...)`.** `cy.type` refuses a multi-element subject, so upstream
  resolves to exactly one input; `.first()` is that same element. `fill` was
  sufficient — the preview picked the value up and the assertion on it in the
  embed iframe passes and is mutation-proven.
- **Four `should("not.exist")` → non-retrying `expect(await
  loc.count()).toBe(0)`** per the one-shot rule, with each anchor asserted
  separately first where the Cypress chain carried an implicit existence
  assertion (`H.getSimpleEmbedIframeContent().findByTestId("embedding-footer")`
  asserts the iframe exists *and* has no footer — the port asserts the iframe
  content is rendered before counting, so the absence half cannot pass on an
  unloaded frame).
- `H.enableTracking()` → `updateSetting("anon-tracking-enabled", true)`;
  `H.resetSnowplow()` / `H.expectNoBadSnowplowEvents` → the capture's structural
  equivalent (Iglu validation still unavailable — the known downgrade).
- `H.mockEmbedJsToDevServer()` dropped (jar serves the real asset).

## 7. Not verified — stated rather than buried

- **`completeWizard` still unexercised.** Confirmed the reason survives on the
  guest path: this spec never clicks "Done", and its `enable_embedding` dance is
  done through Publish/Unpublish. The §4 speculation in
  `findings-inbox/sdk-embed-setup.md` that "the guest path may well enable it"
  is neither confirmed nor refuted here. Not a bug claim.
- **The `metabot` experience trap did not apply** — this spec uses only `chart`
  and `dashboard`, so `llm-anthropic-api-key` was never needed. The warning
  still stands for `select-embed-options`.
- **No Cypress cross-check was run**, because nothing failed that needed one:
  every failure during stabilisation was in my own port and had a mechanical
  explanation. Per FINDINGS #31, the cross-check establishes fidelity for
  *claims*, and this port makes none.
- **No product-bug claims.** Nothing fixme'd, nothing skipped.
- `guest-embed-oss.cy.spec.ts` (294 lines) is **not** ported here. It is now a
  cheap follow-up: same fixtures, same flow, drop `activateToken`, and flip the
  two `upsell-card` assertions. The one thing to check is that the no-token flow
  gets past `visitNewEmbedPage` on an EE jar — my probe above shows it does
  **not** on this slot, which is the single risk in that port and worth an early
  look rather than a late surprise.
