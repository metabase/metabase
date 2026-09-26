# Reconstruction report — metabase#53299

_Verbatim final report from the worktree-isolated reconstruction agent (a93bb436abf2fcb11)._

---

I've completed a thorough empirical investigation. Restored the tree to pristine (`git diff` is now empty). Here is my honest report.

## Outcome: `reconstruction_failed` (for the named oracles)

A faithful reintroduction of bug #53299 does **not** flip either candidate oracle deftest in current master, because the fix's discriminating test change was a **deletion** of a throw-assertion, not an added positive assertion.

### 1. The fix and the attempted reconstruction diff

Fix commit `495776dc` removed the `(with-native-extras native-extras)` wrap (and the 3-arity + JS overload) from `with-different-database` in `src/metabase/lib/native.cljc`. Buggy behavior: switching a native query to a collection-requiring DB (MongoDB) threw `Missing extra, required keys for native query: #{:collection}`.

The faithful minimal semantic revert I applied and tested (then reverted to leave the tree clean) — in `/Users/fraser/Documents/code/metabase/src/metabase/lib/native.cljc`, `with-different-database`:

```clojure
;; from (fixed):
    (lib.query/query-with-stages metadata-provider stages-without-fields)))
;; to (buggy):
    (-> (lib.query/query-with-stages metadata-provider stages-without-fields)
        (with-native-extras nil))))
```

REPL simulation confirmed this exactly reintroduces the bug: switching to a collection-requiring provider throws `Missing extra, required keys #{:collection}`; switching to a non-requiring provider works fine.

### 2. Oracle namespaces + baseline/reconstructed counts

Both candidate deftests live in `test/metabase/lib/native_test.cljc`:
- `metabase.lib.native-test/with-different-database-test`
- `metabase.lib.native-test/native-query+collection-test`

| Run | Result |
|---|---|
| Baseline (both + `with-native-collection-test`) | 10 assertions, **0 failures, 0 errors** |
| Faithful `with-different-database` revert | 10 assertions, **0 failures, 0 errors** (unchanged) |
| Alt lever: revert `native-query`'s `cond->` → unconditional `with-native-extras` | 1 error — but in **`with-native-collection-test`** (issue #62556), **not** a named oracle |

### 3. Failure shape
None. The reconstruction produces no assertion failure in either named oracle.

### 4. Why (confidence: high)

- **`with-different-database-test`** — The fix **removed** its discriminating block (`"Checks collection requirement"`), which contained the `thrown-with-msg?` on `(with-different-database query (metadata-provider-requiring-collection))`. The fix did not replace it with a positive "does not throw" assertion. So in current master this deftest has **no assertion that exercises `with-different-database` against a collection-requiring provider** — the exact code path the bug affects. Its surviving assertions use only non-requiring providers (`updated-metadata-provider assoc :id 9999`) and the `"Must be a native query"` guard, both of which pass identically in buggy and fixed code (empirically verified).

- **`native-query+collection-test`** — Its fix-added assertion is `(=? {:stages [(complement :collection)]} (lib/native-query meta/metadata-provider "myquery"))`, using `meta/metadata-provider`, whose `required-native-extras` is `#{}` (verified in REPL). No implementation of `native-query`/`with-different-database` can make a non-requiring provider yield a `:collection` key or throw, so this is a non-discriminating regression guard, invariant to any `#53299` revert.

**Adversarial self-check** — three independent routes agree: (1) REPL simulation of the pre-fix `with-different-database` pinpointed that only a *collection-requiring* switch throws; (2) real `test-agent` baseline vs. reconstructed for the faithful revert both give 10/0; (3) the only native.cljc lever that flips any test flips `with-native-collection-test` (a different issue, #62556), not the named oracles. I also confirmed cwd is the worktree (`.claude/worktrees/agent-a93bb436abf2fcb11`), ruling out the false-negative gotcha — baseline genuinely passes there.

### 5. Ambiguity / root cause of the failure
The true discriminating oracle for #53299 was the `thrown-with-msg?` assertion `(-> query (lib/with-different-database (metadata-provider-requiring-collection)))` inside `with-different-database-test`. The fix corrected the bug by making that call *stop throwing* and then **deleted the now-obsolete throw-test rather than converting it into a positive assertion**. Consequently, reintroducing the bug into product code cannot be observed by any surviving assertion in either candidate deftest in current master. This is a genuine "fix removed its own discriminating test" case, not a localization miss.
