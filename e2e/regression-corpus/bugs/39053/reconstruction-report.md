# Reconstruction report — metabase#39053

_Verbatim final report from the worktree-isolated reconstruction agent (a919f152d4da2d380)._

---

Semantic reconstruction complete and proven. Report below.

## 1. Reconstruction `git diff`

`src/metabase/users/settings.clj` (worktree copy):

```diff
   (deferred-tru "The last database a user has selected for a native query or a native model.")
   :user-local :only
   :visibility :authenticated
-  :type :integer
-  :getter (fn []
-            (when-let [id (setting/get-value-of-type :integer :last-used-native-database-id)]
-              (when (t2/exists? :model/Database :id id) id))))
+  :type :integer)
```

Minimal, semantic: strip the custom `:getter` from the `last-used-native-database-id` setting, reverting it to a plain integer setting that echoes back whatever id was persisted. (`t2` and `setting` remain required elsewhere/via refer; the namespace still compiles.)

## 2. Oracle + results

- **Namespace/name:** `metabase.users.settings-test/last-used-native-database-id-can-be-read-and-set` (file `test/metabase/users/settings_test.clj`; ns derived from path).
- **Baseline (current code):** PASS — `3 assertions, 0 failures, 0 errors`.
- **Reconstructed:** FAIL — `3 assertions, 1 failure, 0 errors` (`:pass 2, :fail 1, :error 0`). Namespace loaded and all 3 assertions executed, confirming it is an assertion failure, not a load/compile error.

## 3. failure_shape

- **symptom:** `last-used-native-database-id` returns a stale/nonexistent database id (e.g. one whose DB was deleted or the user can't access) instead of `nil`. This is bug #39053 — the native-query editor tries to restore a database that no longer exists.
- **repro_failure:**
  ```
  FAIL in ...last-used-native-database-id-can-be-read-and-set (settings_test.clj:20)
   returns nil if the database doesn't exist
  expected: (nil? (users.settings/last-used-native-database-id))
    actual: (not (nil? -999))
  ```

## 4. Confidence + adversarial reasoning

**Confidence: high**, with one important caveat about the named fix commit (see §5).

Adversarial self-check — is this the real historical bug or an incidental trip? It is the **real bug**. The `:getter` that filters out nonexistent databases is the entire behavioral guard for the "returns nil if the database doesn't exist" assertion. Removing it fails *only* that assertion; the initial-nil (#1) and set-then-read-existing (#2) assertions still pass, because a plain integer setting stores and returns real ids fine — it only fails to reject the deleted-db id. That is precisely the class of failure #39053 describes. This is not an incidental trip (no schema/arity/typo breakage, no cascade of unrelated errors, no load failure) — it is a targeted reintroduction of the exact stale-reference behavior.

## 5. Ambiguity (honest)

The task named fix commit **576e1511 (#38986)** as the fix, but that commit only *introduced* the setting as a plain `:type :integer` (no getter) and its test had no "database doesn't exist" assertion. The behavior the current oracle actually guards — and the code I reverted — was added by a **later** commit, **7b66a6509b7 (#39269)**, "Do not return setting value if the database persisted in `last-used-native-database-id` does not exist (anymore)," which added both the `:getter` and the third assertion.

This is the drift: the current oracle cannot be satisfied/broken by the literal #38986 diff, since removing the whole setting would be a load error (undefined `users.settings/last-used-native-database-id`), not an assertion failure. The faithful semantic reconstruction of the bug the oracle proves is to undo the #39269 getter. Notably, doing so reproduces the *exact* state of the setting as it existed in the named commit 576e1511 (plain integer, no getter) — so the reconstruction is consistent with both commits: it is the pre-getter state that the #38986-era code shipped, and the #39053 bug it exhibits is what #39269 later fixed. No blocker; the reconstruction is unambiguous once this provenance is understood.
