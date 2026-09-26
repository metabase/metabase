# Reconstruction report — metabase#41635

_Verbatim final report from the worktree-isolated reconstruction agent (a73bbe406a9c03ae2)._

---

## Reconstruction report — metabase#41635

**(1) `git diff`** (single file, 16-line deletion — the entire hunk is the removed route):

```diff
diff --git a/src/metabase/embedding_rest/api/preview_embed.clj b/src/metabase/embedding_rest/api/preview_embed.clj
index c8e4d71b903..a1a1d65d989 100644
--- a/src/metabase/embedding_rest/api/preview_embed.clj
+++ b/src/metabase/embedding_rest/api/preview_embed.clj
@@ -107,22 +107,6 @@
     (api.embed.common/dashboard-for-unsigned-token unsigned-token
                                                    :embedding-params (embed/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params]))))
 
-;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
-;; use our API + we will need it when we make auto-TypeScript-signature generation happen
-;;
-#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
-(api.macros/defendpoint :get "/dashboard/:token/params/:param-key/values"
-  "Embedded version of chain filter values endpoint."
-  [{:keys [token param-key]} :- [:map
-                                 [:token api.embed.common/EncodedToken]
-                                 [:param-key ms/NonBlankString]]
-   query-params]
-  (api.embed.common/dashboard-param-values token
-                                           param-key
-                                           nil
-                                           (api.embed.common/parse-query-params query-params)
-                                           {:preview true}))
-
 ;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
 ;; use our API + we will need it when we make auto-TypeScript-signature generation happen
 ;;
```

**Root cause of drift**: the "common impl" refactor moved this code from `src/metabase/api/preview_embed.clj` → `src/metabase/embedding_rest/api/preview_embed.clj` (module reorg), and a *later* fix (#44962, referenced in the test's own comment) added a `{:preview true}` bypass-flag mechanism on top. Neither change is part of #41635's fix, which is why `git apply -R` no longer applies — but the fixed behavior (the endpoint's mere existence) is still fully present and identifiable.

**(2) Oracle test / baseline / reconstructed**
- Namespace: `metabase.embedding-rest.api.preview-embed-test`, test: `params-with-static-list-test`
- Baseline (before edit): `2 assertions, 0 failures, 0 errors` — PASS
- Reconstructed (after edit): `2 assertions, 2 failures, 0 errors` — FAIL

**(3) Failure shape**: clean assertion failure via `mt/user-http-request`, not an exception/compile error:
```
expected a status code of 200, got 404. Response body: "API endpoint does not exist."
expected: {:has_more_values false, :values [["African"] ["American"] ["Asian"]]}
  actual: "API endpoint does not exist."
```

**(4) Confidence: high.** Verified via `git show 2455537...^:src/metabase/api/preview_embed.clj` that `/dashboard/:token/params/:param-key/values` did not exist at all pre-fix (only the `/card/:token/params/:param-key/values` route existed) — the commit's diff shows it purely as a `+` addition, no corresponding removed hunk. This matches the commit's own stated intent ("Make embedding preview behave consistently with actual static embeds") and the test itself, which was added in that exact commit and nowhere earlier. Adversarial check: I ran the two neighboring tests that share this code path — `dashboard-params-search-test` (hits the sibling `/search/:prefix` route, untouched) still **passes**, confirming the revert is scoped to exactly the one route the oracle exercises and isn't a blunt-force break of the whole file. `preview-locked-linked-chain-filter-values-test` (added much later, in 2026, as a backport of an e2e test, but exercising the same `/values` route and citing the same #41635 issue in its `testing` string) also now fails — this is expected, correct collateral: it depends on the identical capability this commit introduced, not on unrelated code.

**(5)** No ambiguity — this is a case where the "fix" is literally "the endpoint didn't exist yet," so the semantic inverse is unambiguous: delete the endpoint definition. I did not touch `common.clj`'s `dashboard-param-values` function itself (which would have also broken `/search`), keeping the revert to the single route the oracle test hits.

File touched: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a73bbe406a9c03ae2/src/metabase/embedding_rest/api/preview_embed.clj`
