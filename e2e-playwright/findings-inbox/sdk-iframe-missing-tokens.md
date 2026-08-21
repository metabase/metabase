# sdk-iframe-missing-tokens — findings

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/missing-tokens.cy.spec.ts` (61 lines, 2 tests).
Slot 4 (:4104), jar mode (`version.hash` `751c2a9` == `target/uberjar/COMMIT-ID` `751c2a98`).

**Result: 2/2 executed green, 4/4 under `--repeat-each=2`. No dividends, no product-bug claims.**

## The pre-existing partial was drifted — rewritten, not repaired

A partial `tests/sdk-iframe-missing-tokens.spec.ts` was on disk from a cancelled
session. It had **two independent drifts**, both in the inputs, and it had never
been run (there was no findings file):

1. Test 1 used `withToken: "bleeding-edge"`. Upstream's shared `beforeEach` uses
   `withToken: "starter"` for **both** tests — the whole spec is "without token
   features", so a bleeding-edge token removes the condition under test.
2. Test 2 passed `origin: "http://example.com"`. Upstream deliberately passes
   **no** `origin` there, so the customer page is served from the (localhost)
   baseUrl. That is the *only* input the two tests differ on, and the partial had
   made them identical — asserting "no license error on a non-localhost page",
   which directly contradicts test 1.

Both drifts are provably fatal, not cosmetic: re-running the faithful port with
exactly those two inputs restored (the mutation runs below) fails both tests.
So the partial would have gone red on its first execution.

Generalisable: **when two sibling tests differ in exactly one input, say so in
the header and check that the port preserves it.** Both drifts here were of the
form "made the two tests more alike", which is the easy direction to drift in
and the one that silently destroys the discrimination the spec exists for.

## Fidelity notes

- `origin: "http://example.com"` goes through the harness's `productionSafeOrigin`
  (upgraded to `https://` to get past Chromium's Private Network Access rule).
  Faithful: `embed.ts#_getIsLocalhost` reads `window.location.hostname` only.
- The error text is asserted **EXACTLY**, per the brief's `ERROR_DOC_LINKS` note.
  Confirmed correct — the rendered node is exactly
  "A valid license is required for embedding."; no "Read more." is appended,
  because that table's single entry is `EXISTING_USER_SESSION_FAILED`.
- `should("not.exist")` → retrying `toHaveCount(0)`.
- Test 2 adds a positive anchor upstream does not have: `waitForSimpleEmbedIframesToLoad`
  plus the `questionId: "new"` notebook's "Pick your starting data". Without it
  the absence check would be satisfied by "the SDK has not painted yet"
  (`data-iframe-loaded` fires well before first paint).

## Mutation results (3 run, all killed)

1. **Test 1 loses `origin: "http://example.com"`** (→ served from localhost) →
   red: the license error never appears. Proves the origin is the load-bearing
   input and that test 1 is not passing on some unrelated error state.
2. **Test 2 gains `origin: "http://example.com"`** → red at the "Pick your
   starting data" anchor. Proves the anchor is live and that the two tests
   really are discriminated by origin alone. (This is mutation #1 of the two
   drifts the partial shipped.)
3. **Targeted, because #2 kills at the anchor and leaves the closing assertion
   unproven:** retarget the closing `toHaveCount(0)` at "Pick your starting
   data" (text that IS present) → red, `24 × locator resolved to 1 element`.
   Proves the absence locator resolves inside the embed frame and the
   `toHaveCount(0)` is **not vacuous**.
