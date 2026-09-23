# sdk-embed-setup-embed-flow-enable-embed-js-ee — port findings

Slot 2 (:4102), jar mode. Backend verified before trusting any green:
`version.hash = 751c2a9` vs `target/uberjar/COMMIT-ID = 751c2a98`, process is
`java -jar target/uberjar/metabase.jar`.

Source:
`e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/embed-flow-enable-embed-js-ee.cy.spec.ts`
(186 lines, 7 tests) → `tests/sdk-embed-setup-embed-flow-enable-embed-js-ee.spec.ts`.

## Numbers

- **7 executed, 0 gate-skipped, 0 fixme, 0 test.skip.**
- **7/7 green** (7.9s). **14/14 under `--repeat-each=2`** (16.9s).
- `bunx tsc --noEmit` clean; prettier clean.
- **No support-module changes.** `support/sdk-embed-setup.ts` consumed read-only
  — that is now **eleven** Group B specs with zero helper churn. No companion
  support module either; every helper already existed (`filter-bulk.ts`
  `hovercard`, `notebook.ts` `entityPickerModal`, `sdk-embed-setup.ts`,
  `sdk-iframe.ts`, `sharing.ts`, `ui.ts`).

## What I did with the pre-existing partial file

The cancelled agent had left a **structurally complete and, as far as I can
tell, correct** port — with **a live mutation still in it**: both `cardText`
values read `"ZZZ enable … embeds and agree to the usage conditions."` instead
of `"To continue, enable …"`. It had been cancelled mid-mutation-check.

I read it against the Cypress original line by line, restored the two
`cardText` strings, and kept everything else. Two header claims turned out to
be wrong or overstated and I corrected them (below). Nothing else was changed.

**Worth flagging as a process risk:** a spec left in this state is green under
`--repeat-each=2` and tsc-clean, because the mutation lives in a *shared
constant* that the assertions merely echo. Test 1 asserts `toContainText(cardText)`
against a card that would have to render "ZZZ…" — so it *did* fail — but nothing
about the file's appearance says "mutated". Restoring from the Cypress original
rather than eyeballing the port is the only safe move.

## Is the EE tier gate real? YES for `modular`, INERT for `guest` — and it is
## per-DESCRIBE, not per-file

This is the trap in this particular spec: **the EE-ness is not file-scoped.**
`DATA_BY_EMBEDDING_TYPE.guest` carries `token: null` and `modular` carries
`token: "bleeding-edge"`, so upstream itself runs 3 of the 7 tests unlicensed.
There is no `@OSS` tag and no EE-only describe, so there is nothing to
`test.skip` — a reflexive file-level skip would have deleted 7 tests, and a
reflexive "unlicensed EE ≈ OSS, it'll all run" would have been wrong for 3.

**`activateToken` was verified to actually take**, not merely to not-throw (the
brief's warning about `failOnStatusCode: false` is well founded — see the
false-negative note below). Read off `GET /api/session/properties`:

| describe | `token-features` |
| --- | --- |
| `guest` | `{}` |
| `modular` | 50+ true, incl. `embedding_simple`, `sso_jwt`, `embedding_sdk` |

**Measured (probe: `activateToken` disabled in the beforeEach, nothing else
touched):**

| tests | result |
| --- | --- |
| 3 × `modular` | **all fail** |
| 3 × `guest` + 1 top-level | **all pass** |

So the gate is real and load-bearing for exactly the half that declares it.
This lands with `common-ee` (gate real) and against `select-embed-options`
(gate not real) — PORTING.md's "tier gating does NOT generalise across specs,
probe each one" holds, and this spec sharpens it: **gating may not generalise
across describes *within* one spec either.**

### The failure MECHANISM is earlier than the obvious guess — header corrected

The partial file's header asserted that unlicensed, "the SSO radio is disabled
and the flow the `modular` tests drive does not exist", citing the
`-oss-and-starter` sibling's `findByLabelText("Metabase account (SSO)").should("be.disabled")`.

The sibling citation is accurate (that assertion is real, at line 180 of
`embed-flow-enable-embed-js-oss-and-starter.cy.spec.ts`) — but **it is not where
this spec dies.** Captured call log from the no-token run:

```
TimeoutError: locator.click: Timeout 8000ms exceeded.
  - waiting for getByTestId('sdk-setting-card').first().getByText('New embed', { exact: true })
```

Unlicensed, the `sdk-setting-card` on `/admin/embedding` renders **no "New
embed" button at all** — the wizard never opens, so the SSO radio is never
reached. Note also that `updateSetting("enable-embedding-simple", true)`
*succeeds* (2xx) without a token; the gating is in the FE, keyed on
`token-features`, not in the setting write. Header rewritten to the measured
mechanism, with the superseded claim recorded rather than silently deleted.

## Mutation results — non-vacuous, in both directions

Run as **two batches with mutually exclusive targets**, so each batch has real
controls rather than an all-red sweep.

**Batch 1** — expect tests 2, 5, 7 red; 1, 3, 4, 6 green:

| mutation | target | result |
| --- | --- | --- |
| absence locator repointed at the rendered title ("Agree to the usage conditions to continue.") | tests 2, 5 | ✘ `toHaveCount(0)` |
| drop the "Agree and enable" click | test 7 | ✘ `toHaveCount(1)` |

→ **exactly 3 failed, 4 passed.**

**Batch 2** — the exact complement, expect 1, 3, 4, 6 red; 2, 5, 7 green:

| mutation | target | result |
| --- | --- | --- |
| test 3's sidebar absence repointed at `authMethodLabel` (present in the sidebar) | tests 3, 6 | ✘ `toHaveCount(0)` |
| drop the "Agree and enable" click | tests 1, 4 | ✘ `toBeVisible()` on `/Enabled/` |

→ **exactly 4 failed, 3 passed.**

**Honest caveat on mutation TYPE.** The brief prefers inverting *inputs*. The
status-bar absence (test 7) got a proper input inversion. The two card-text
absences did **not**: the state that would make `cardText` render
(`isEnabled: false`) also changes the card's title, so it kills at the positive
anchor one line above and leaves the absence itself unproven. I used a
locator-target corruption instead, which is the right probe for the specific
vacuity risk here — that `getByText(cardText, { exact: true })` might match
*nothing ever* because of the mixed-content-text-node trap (the title `<Text>`
in `EnableModularEmbeddingSection.tsx` has an inline `UsageConditionsInfoIcon`
sibling). It doesn't: the exact locator matches the rendered title fine. Stated
rather than glossed.

**Not mutation-proven:** the in-iframe `getByText("Orders in a dashboard")` at
the end of test 1. The clean input inversion would be picking a *different*
dashboard, and the default snapshot has exactly one (`GET /api/dashboard` →
`['Orders in a dashboard']`). It is a positive in-frame assertion, so it cannot
go vacuously green the way an absence can — a missing frame fails rather than
passes — but I did not independently corrupt it. Recording the gap.

## A false negative worth propagating: `mb.api.get(...).body` is a FUNCTION

My first attempt to verify the token read `(await mb.api.get("/api/session/properties")).body["token-features"]`
and printed `{}` for **both** describes — which looks exactly like "the token
silently failed to apply", the precise failure the brief warns about. It was my
probe that was broken: `MetabaseApi.get` returns a Playwright `APIResponse`,
whose `.body` is a **method**, so `.body["token-features"]` is `undefined` and
the `?? {}` fallback manufactured a plausible-looking empty result. Correct form
is `await (await mb.api.get(url)).json()`.

Note the shape of the trap: `api.getDashboard()` *does* return a destructurable
`{ status, body }` (see `support/ui.ts visitDashboard`), so the `.body`-as-data
habit is learned from the codebase itself and then silently wrong on the raw
`get`/`post`/`put`. **It fails in the direction of "the EE gate isn't working"**
— i.e. it would have led me to report the exact opposite of the true answer had
I not cross-checked with `curl`. Anyone probing tokens should confirm against a
direct HTTP call before believing an empty `token-features`.

## Things from the brief that did NOT apply / did not reproduce

- **`getEmbedSidebar()` modal-vs-aside discrepancy is inert here.** Both uses in
  this spec (the "info icon" in test 2, the absent card text in test 3) target
  content inside the `<aside>`, so the shared narrower helper resolves the same
  elements upstream's modal-scoped version does. Not widened, per the helper
  docstring's instruction. (`select-embed-options` and `user-settings-persistence`
  remain the specs to audit.)
- **`getSimpleEmbedIframeContent()` is a GATE, not an accessor** — confirmed
  against the Cypress source: it asserts iframe count > index, `data-iframe-loaded`
  count > index, visibility, and `contentDocument` existence before yielding.
  Inert in this spec, because upstream calls `waitForSimpleEmbedIframesToLoad()`
  immediately before it, which the port carries. The bare `getSimpleEmbedIframe`
  accessor is therefore the faithful mapping *here*; it would not be in a spec
  that reached for the frame without the preceding wait.
- **Snowplow:** this spec asserts nothing about snowplow and calls no tracking
  helper, so no capture was installed. Nothing to defeat, and the
  "route `/api/session/properties` after `installSnowplowCapture`" hazard never
  arises.
- **`completeWizard` / the `metabot` experience / `llm-anthropic-api-key`:** none
  are touched by this spec.
- **Instance-wide setting mutation:** the spec writes `enable-embedding-static`,
  `enable-embedding-simple`, `show-*-embed-terms` and the premium token. All are
  reset by `mb.restore()` in the outer `beforeEach` — demonstrated, not assumed:
  after I manually PUT the `bleeding-edge` token onto :4102 via `curl`, the very
  next run's `guest` probe still read `token-features = {}`. Verified across
  many consecutive runs plus `--repeat-each=2`.

**No product-bug claims from this port.** Nothing was fixme'd. Every correction
was to the port (or to its header), not to the app.

## Summary (3 lines)

Straight port, no dividends, no product-bug claims: 7/7 executed and green on
the jar, 14/14 under `--repeat-each=2`, tsc clean, zero shared-support changes;
the pre-existing partial was sound apart from a live `cardText` mutation left by
the cancelled agent, which I restored from the original.
The EE gate is **per-describe, not per-file** — `modular` (3 tests) genuinely
requires `bleeding-edge` and fails 3/3 without it, while `guest` (3 tests) plus
the top-level test are unlicensed upstream by design and pass tokenless.
The reusable lesson is a false negative: `mb.api.get(...).body` is a *method*,
so a naive token probe reports an empty `token-features` and fabricates exactly
the "the gate isn't real" conclusion you were testing for.
