# Reconstruction report — metabase#49142

_Verbatim final report from the worktree-isolated reconstruction agent (a2a4ba52a616b50d5)._

---

Reconstruction succeeded. Report below.

## Reconstruction Report — metabase#49142

### (1) `git diff`
```diff
diff --git a/src/metabase/server/middleware/security.clj b/src/metabase/server/middleware/security.clj
@@ -144,8 +144,7 @@
 (def ^:private always-allowed-iframe-hosts
-  ["'self'"
-   "https://www.metabase.com/"
+  ["https://www.metabase.com/"
    "https://metabase.com/"])
```
File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a2a4ba52a616b50d5/src/metabase/server/middleware/security.clj`

### (2) Oracle + results
- Oracle ns/name: `metabase.server.middleware.security-test/csp-header-iframe-hosts-tests` (test file: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a2a4ba52a616b50d5/test/metabase/server/middleware/security_test.clj`, lines 65-67 is the fix-added `#49142` assertion).
- Baseline (worktree cwd): PASS — 5 assertions, 0 failures.
- Reconstructed: FAIL — 5 assertions, 2 failures.

### (3) Failure shape
Assertion failure (not error/compile). The fix-added assertion fires:
```
FAIL ... (security_test.clj:67)
Includes 'self' so embed previews work (#49142)
frame-src hosts does not include 'self'
expected: (contains? hosts "'self'")
  actual: (not (contains? #{...host set without 'self'...} "'self'"))
```
The pre-existing string-equality assertion at line 60 also fails (actual `frame-src` string is missing the leading `'self'`).

### (4) Confidence + adversarial reasoning
Confidence: high.
- The bug's essence is exactly "`frame-src` CSP directive omits `'self'`, so embed-preview iframes pointing at our own origin are blocked." The original fix injected `'self'` in `parse-hosts-string`; the code has since been refactored so `'self'` lives as the first element of the `always-allowed-iframe-hosts` vector, consumed by `parse-allowed-iframe-hosts*` → `csp-directive "frame-src"`. Removing that single element is the minimal semantic revert and reproduces the original defect precisely.
- Blast radius is contained: `always-allowed-iframe-hosts` feeds only the `frame-src` directive. `img-src`/`font-src` use a separate `always-allowed-resource-hosts` and are untouched.
- Adversarial note on oracle choice: the *other* named oracle, `allowed-iframe-hosts-test`, does NOT fail under this revert — it references `@#'mw.security/always-allowed-iframe-hosts` symbolically on both sides of its `(concat …)` equalities, so removing `'self'` changes expected and actual symmetrically and the assertions still pass. That is why I selected `csp-header-iframe-hosts-tests`, whose fix-added assertion hard-codes the literal `'self'` membership check and therefore fails cleanly.

### (5) Ambiguity
Minor: the fix landed in `parse-hosts-string` (`vec` → `(into ["'self'"])`), but the current code carries `'self'` in `always-allowed-iframe-hosts`. I reverted at the current home of the behavior rather than reintroducing the old `parse-hosts-string` shape — semantically equivalent and cleaner. No `reconstruction_failed`.
