# sdk-iframe-metabase-browser (Group A, slot 5 / :4105)

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/metabase-browser.cy.spec.ts` (219 lines)
Target: `e2e-playwright/tests/sdk-iframe-metabase-browser.spec.ts`

## Summary (3 lines)

Straight port. **5 tests, 5 executed, 0 skipped, 0 fixme; 10/10 under `--repeat-each=2`;
`bunx tsc --noEmit` clean.** `support/sdk-iframe.ts` needed **zero** changes and no
companion support module was needed — the eighth consecutive Group A spec for the
harness, and the third in a row needing no new helper file.
**No dividends and no product-bug claims.** Nothing in the brief failed to reproduce.

## Status

| | |
| --- | --- |
| pass (executed) | 5 / 5 |
| skip / fixme | 0 |
| `tsc --noEmit` | clean |
| stability | 10/10 under `--repeat-each=2`, all on the jar |
| runtime | ~5.3s for the file (0.6–1.2s/test) |

Verified on `target/uberjar/metabase.jar` throughout (jar-mode default; the slot
backend line read `(reused)` and was **not** followed by mass failures — the
mutation runs below confirm the backend was live and honouring writes).

## Helpers: imported, none declared

Everything came from existing modules — no new file, no shared-module edit:

- `updateCollectionGraph` ← `support/click-behavior.ts` (GET-merge-PUT port of
  `cy.updateCollectionGraph`; `{...groups, ...obj}` matches upstream's
  `Object.assign` group-level replacement).
- `createCollection` ← `support/dashboard-core.ts`.
- `DATA_GROUP` ← `support/collections-core.ts`. Upstream imports `DATA_GROUP_ID`
  from `cypress_sample_instance_data` (looked up by group *name*); `DATA_GROUP` is
  the `USER_GROUPS.DATA_GROUP` literal. **Verified equal on this snapshot**: the
  group named `data` has id 6.
- `mb.api.createQuestion` covers `H.createQuestion({name, query, collection_id})`
  exactly for this spec's shape.
- `setupEmbed` is spec-local upstream (each Cypress spec in this dir has its own
  private copy), so it stays spec-local here — same shape as the landed
  `view-and-curate-content` port. Duplication is the faithful state.

## Mutation testing — all 5 tests killed, plus targeted probes for late assertions

**Round 1 — input inversions (all 5 red):**

| test | mutation | result |
| --- | --- | --- |
| 1 | collection perm `none` → `read` | ✘ at the "You don't have access…" assertion |
| 2 | collection perm `read` → `write` | ✘ at the **"New question" absence**, `Received: 1` |
| 3 | collection perm `read` → `write` | ✘ at the **"Save" absence**, `Received: 1` |
| 4 | removed the `sdk-breadcrumbs` "New question" click | ✘ at "Pick your starting data" |
| 5 | removed the `sdk-breadcrumbs` "New question" click | ✘ at "Pick your starting data" |

Tests 2 and 3 died at their **final** assertion — the ones that matter — so those
are fully proven. Test 3 reaching its last line also proves the whole
filter flow (open Filter → pick ID → type "1" → Add filter) executed.

**Round 2 — targeted mutations, because round 1 killed tests 1/4/5 at an earlier
assertion** (the failure mode the brief warned about; a sibling hit it too):

- **Test 1's absence assertion.** Retargeted `toHaveCount(0)` at
  `"You don't have access to this collection"` — text known present.
  ✘ `Received: 1`. So that absence check runs against a *rendered* frame and is
  not satisfied by "nothing painted yet".
- **Tests 4 & 5's final `not.toHaveText("Orders")`.** Inverted to
  `toHaveText("Orders")`. ✘ `Received: "Pick your starting data"` — the
  `data-step-cell` element resolves and genuinely reads the reset state. This
  also rules out the PORTING "pre-interaction placeholder" trap: the assertion is
  reading a real, post-reset value, not a locator that never existed.

**Round 3 — did "Add filter" actually land?** Upstream never asserts the filter
was applied, so a silently-swallowed click (the known
`MultiAutocomplete`/`PillsInput` submit gotcha) would leave test 3 green for the
wrong reason. Probed: after `Add filter`, `getByPlaceholder("Enter an ID")` is
`toHaveCount(0)` — the value panel closed, so the click was delivered. **The
gotcha does not fire here**; no `blur()` workaround was needed and none was added.

## Things from the brief that did apply

- **`cy.type()` clicks its subject first.** Ported literally: `click()` →
  `expect(idInput).toBeFocused()` → `page.keyboard.type("1")`. (Here the Cypress
  subject really *is* the input, so the click is a no-op semantically — but
  porting it literally is free and matches the rule.)
- **Breadcrumb re-render hazard.** The `sdk-breadcrumbs` "New question" locator is
  resolved only *after* `data-step-cell` reads "Orders", i.e. against a settled
  trail. Upstream's own `cy.wait("@datasetMetadata")` + `data-step-cell` check
  supplies exactly that gate, so this is faithful rather than added.
- **`textContent()` on an iframe body also reads injected `<style>`.** Confirmed
  again incidentally during the round-3 probe (the body text begins with
  `.mb-wrapper{--mantine-z-index-app: 100;…`). This spec makes **no** body-text
  assertions, so it is unaffected.
- **Rule 2 (`cy.intercept().as()` → `waitForResponse` armed before the trigger).**
  `POST /api/dataset/query_metadata` armed immediately before the "Orders" click.

## Things from the brief that did NOT apply here

- No `page.route` of `/api/session/properties`, no snowplow capture, no
  production origin, no CORS/PNA surface — none of the solved environmental
  blockers were touched.
- No `.first()` and no `force: true` anywhere in the file. Every `getByText`
  resolved to exactly one element under strict mode.
- No `test.skip` gate: the file runs entirely on a bleeding-edge token.

## Note on the auth model (resolved empirically, worth recording)

I initially expected these permission tests to be defeated by the harness: the
mocked JWT provider returns a token for **admin**, yet the spec's assertions
depend on the embed running as `nocollection`. Reading
`embedding-sdk-ee/auth/auth.ts` did not settle it quickly. The tests settle it:
test 1 shows the access error and test 3 shows no Save button, and both flip
when the collection graph is inverted — so the embed *is* running under the
`nocollection` session that `mb.signIn("nocollection")` installed, not under the
mock's admin JWT. Recording this so the next Group A agent does not re-derive it
from source: **`prepareSdkIframeEmbedTest` + a later `mb.signIn(<user>)` does
produce an embed authenticated as `<user>`.** I did not trace *which* code path
makes that true, and I am not claiming one.

## Anti-#39 note

The harness's `assertEmbedTargetsThisSlot` was not called, but the slot question
is answered behaviourally by the mutations: the restricted/read-only collections
exist **only** on this slot's app DB (created via `mb.api` at :4105), and editing
their permission graph on :4105 changed what the embed rendered, in both
directions. A :4000 misdirection could not produce that.
