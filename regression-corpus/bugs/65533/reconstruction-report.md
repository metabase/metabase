# Reconstruction report — metabase#65533

_Verbatim final report from the worktree-isolated reconstruction agent (aa13963a16bdd9ec2)._

---

I've completed the investigation and reached a confident conclusion: this reconstruction cannot be done as specified. Reporting honestly rather than thrashing.

## `reconstruction_failed`

### What the fix actually did (commit `f893c48`)
The behavioral change: `template-parameters` gained an `entrypoint-name` parameter and emitted a new template key `:hasColorSchemeMetaTag (not= entrypoint-name "embed-sdk")`, which gates the `<meta name="color-scheme" content="light dark">` tag in `index_template.html`. The bug: that meta tag forced a dark background on EAJS/SDK embeds under system dark mode.

### Why it fails — three independent blockers

**1. The named oracle was never touched by the fix.**
The fix commit's *only* test-file hunk is at `test/metabase/server/routes/index_test.clj:76`, in deftest `load-entrypoint-template-contains-user-locale` — and that hunk added **zero** assertions. It merely changed call arity to match the new signature (`(#'index/template-parameters false {})` → `(#'index/template-parameters "index" false {})`). `git show … -- <testfile> | grep override-localization` returns nothing. The oracle `override-localization-test` (line 51) is not mentioned anywhere in the fix.

**2. The named oracle is semantically unrelated to the bug.**
`override-localization-test` exercises `#'index/load-localization` with override locales (valid override honored, invalid override → English fallback) — pure i18n behavior. It never calls `template-parameters` and has nothing to do with the `color-scheme` meta tag. No semantic revert of the color-scheme logic could make its assertions fail.

**3. The fix's mechanism is gone from current master.**
Although `f893c48` is an ancestor of HEAD, later commits superseded it:
- `#66662` (4794cc30819) — static embeds omit color-scheme
- `#66753` (cf87e41548e) — EAJS/SDK name adjustments
- `#67544` (7a36d9143a2) — prevent black background in light full-app embedding

Current `template-parameters` (src/metabase/server/routes/index.clj:82-105) has reverted to the 2-arg signature `[embeddable? {…}]`, has **no** `entrypoint-name` and **no** `:hasColorSchemeMetaTag`. The color-scheme decision moved to a JS-injected `:userColorScheme` key plus template-layer logic. There is no `hasColorSchemeMetaTag` code path left in the product file to revert.

### Baseline (for the record)
- Oracle ns/name: `metabase.server.routes.index-test/override-localization-test`
- Baseline result: **PASS** — 2 assertions, 0 failures. Both are the localization-override assertions; neither is fix-added, neither relates to color-scheme.

### Adversarial self-check
I verified the fix diff's test hunks in isolation (only line-76 hunk, arity-only), confirmed `override-localization-test`'s current body is purely localization, confirmed the fix is an ancestor yet its `hasColorSchemeMetaTag` mechanism no longer exists in the tree, and confirmed the baseline passes. A correct reconstruction requires fix-added assertions in the oracle to fail — but this oracle has no fix-added assertions and no code coupling to the fix. Any change I made to `load-localization` to break `override-localization-test` would be fabricating an unrelated bug, not reconstructing metabase#65533.

### Root cause of the mismatch (corpus-labeling issue)
The corpus metadata mislabeled the oracle. The fix's genuinely-associated backend test is `load-entrypoint-template-contains-user-locale`, and even there the fix added no assertions (arity-only edit) — the real regression assertion lives in the Cypress spec `custom-elements-api.cy.spec.ts` (`meta[name='color-scheme'] should not exist`), which is not a backend deftest. So there is no backend deftest whose fix-added assertions this reconstruction could target.

Relevant files (absolute):
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-aa13963a16bdd9ec2/src/metabase/server/routes/index.clj`
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-aa13963a16bdd9ec2/test/metabase/server/routes/index_test.clj`

Confidence: high that this specific reconstruction is infeasible.
