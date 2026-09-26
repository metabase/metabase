# Reconstruction report — metabase#8490

_Verbatim final report from the worktree-isolated reconstruction agent (a51f81102e83b9fec)._

---

Reconstruction succeeded. Here is the report.

## Reconstruction Report — metabase#8490

**(1) `git diff`**
```diff
diff --git a/src/metabase/request/session.clj b/src/metabase/request/session.clj
@@ -77,8 +77,7 @@
    (merge
     (with-current-user-fetch-user-for-id *current-user-id*)
     {:is-superuser? true
-     :permissions-set #{"/"}
-     :user-locale i18n/*user-locale*})
+     :permissions-set #{"/"}})
    thunk))
```

**Note on file relocation:** The product code was refactored since the fix commit. The `as-admin` logic moved from `src/metabase/server/middleware/session.clj` → `src/metabase/request/session.clj`, and was extracted from the macro body into a `do-as-admin` helper fn. The fix line (`:user-locale i18n/*user-locale*`) now lives in `do-as-admin` (line 81), not inside the macro. I reverted it there — the semantically equivalent location.

**(2) Oracle**
- Namespace/name: `metabase.request.session-test/as-admin-test` (also relocated from `metabase.server.middleware.session-test`)
- Baseline (worktree cwd): **PASS** — 5 assertions, 0 failures
- Reconstructed (revert applied): **FAIL** — 5 assertions, 2 failures, 0 errors

**(3) `failure_shape`** — Assertion failures (`FAIL`, not `ERROR`), exactly the two fix-added assertions in the `"as-admin preserves any locale settings"` testing block:
- `session_test.clj:40` — expected `"fr"`, actual `nil` (locale not preserved through `as-admin`)
- `session_test.clj:41` — expected `"French"`, actual `"English"` (falls back to default locale)

The first testing block (`"as-admin overrides *is-superuser?* and *current-user-permissions-set*"`, 3 assertions) still passes — the revert is well-localized to the locale-preservation behavior only.

**(4) Confidence + adversarial reasoning** — **High.**
- The fix is a single-line addition to a map; the semantic revert is the exact inverse (removing that key). No `git apply -R` used — I hand-edited the relocated code.
- Adversarial checks: (a) Failures are genuine assertion mismatches, not compile/load errors — the namespace loads and 3 of 5 assertions still pass, proving the test infrastructure is intact and only the target behavior broke. (b) The two failing assertions are precisely the ones the fix commit *added* to the pre-existing `as-admin-test` deftest (confirmed against `git show` of the test file). (c) The mechanism matches the commit's motivating explanation: without binding `*user-locale*`, `do-with-current-user` binds `nil` for the admin context, so `i18n/user-locale` defaults to English. (d) Correct cwd confirmed — ran from worktree root; baseline passed and reverted version failed (not both-pass).

**(5) Ambiguity** — None material. The only wrinkle is the file/refactor relocation, which is unambiguous: there is exactly one `:user-locale i18n/*user-locale*` occurrence in `src/`, in the direct descendant of the patched code, and exactly one current home for `as-admin-test`.
