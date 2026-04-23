# Hardening-commits audit — `bot-1306-more-measures`

Per `notes-to-continue.md`: audit whether the 12 "base-side hardening" commits'
semantic intent still exists in this branch's refactored structure. Research
only — no code changes.

Methodology: `git show <sha>` for each, then grep the current worktree across
`enterprise/backend/src/metabase_enterprise/data_complexity_score/**`, its
tests, and `enterprise/backend/src/metabase_enterprise/semantic_search/**`.

| Commit | Subject | Verdict | Evidence | Porting notes |
|--------|---------|---------|----------|---------------|
| `2da27266b40` | Idiomatic cleanups + include `:weights` in fingerprint and params | **missing** | `data_complexity_score/complexity.clj:285-294` (parameters-map); `task/complexity_score.clj:25-33` (current-fingerprint). Per-dimension weights live in `metrics/{scale,nominal,semantic}.clj` (lines 19-20, 38-40). | `parameters-map` only carries `level`, `synonym_threshold`, `embedding_model` — no `weights` key. `current-fingerprint` carries only `:synonym-threshold`. Weight tuning no longer forces re-scoring unless `formula-version` bumps. |
| `9a49c794796` | Validate `ee-complexity-synonym-*` settings and honour `:threshold` opt | **missing** | No `validate-synonym-config` in `data_complexity_score/complexity.clj`; no `valid-synonym-providers`, `:setter`, or `openai-dimensions-required?` predicate in `settings.clj`; no test coverage. | Port the validation fn, openai-dimensions-required predicate, and `:setter` on `ee-complexity-synonym-provider` to reject typos at write time. Restore tests for half-configured settings and dimension requirements. |
| `f8397030a29` | Batch provider-embedder calls, harden synonym-provider setter | **missing** | No `provider-embedder` call to `process-embeddings-streaming`; no `:setter` validation in `settings.clj`. | Route embedder through `process-embeddings-streaming` so batching survives; mirror the semantic-search setter to reject invalid providers. |
| `66ba80b7740` | Gate synonym-axis meta on provider readiness, propagate embedder errors | **missing** | No `provider-ready?` call in semantic-search; no `resolve-synonym-embedder` path; no error propagation from `provider-embedder`. | Implement provider-readiness gate (or delegate to `semantic.embedding/openai-config-problem`); wire gating into complexity's embedder resolution so `:meta.embedding-model` reflects readiness. |
| `d7401ad2f92` | Harden provider-embedder empty-batch path, test OpenAI batching | **missing** | `complexity_embedders.clj` lacks `or {}` / `mapv` guard; `provider-embedder-openai-batches-reassemble-by-name-test` absent from `complexity_test.clj`. | Add empty-batch guard and restore the reassemble-by-name test. |
| `d1f107a40e9` | Share OpenAI config validation between readiness gate and resolver | **partial** | `semantic_search/embedding.clj:294` has `openai-config-problem`. | data-complexity-score never calls `provider-ready?` and lacks `resolve-synonym-embedder`. Tests `complexity-scores-openai-blank-base-url-falls-back-test` and `complexity-scores-synonym-axis-error-populates-meta-test` are absent. |
| `21be7db541f` | Trim OpenAI settings before validating readiness | **partial** | `semantic_search/embedding.clj:277-291` has `openai-config-snapshot` + trimming. `semantic_search/embedding_test.clj:76` has `test-openai-config-problem-whitespace`. | data-complexity-score never calls the shared trimming snapshot — no end-to-end coverage of the whitespace-settings case through complexity scoring. |
| `5b974cf09d1` | Cover provider-embedder empty-streaming-result path | **missing** | No `provider-embedder-empty-streaming-result-test` in `complexity_test.clj`. | Restore regression test for the `or {}` guard when `process-embeddings-streaming` returns nil / drops every input. |
| `cde4e38c7bc` | Harden complexity emission duplicate assertions | **kept** | `complexity_test.clj:625-660` (`emit-snowplow-publishes-total-and-each-subscore-test`) uses `frequencies` + order-preserving vectors (lines 645-650). | — |
| `20732920615` | Harden complexity emission axis assertions | **kept** | `complexity_test.clj:607-623` (`events-by-key` helper) + subsequent per-key assertions (625-660). Terminology survives `:axis` → `:dimension` rename. | — |
| `459327db1c5` | Assert normalized axis uniqueness in complexity emission test | **kept** | `complexity_test.clj:637-652` — `(= (count catalog+key) (count (set catalog+key)))` guards against dotted-key collisions. | — |
| `e5abe75f31f` | Raise `:threshold` cutoff in explicit-embedder test to actually reject | **missing** | No `complexity-scores-explicit-embedder-accepts-threshold-opt-test`; `:threshold` opt not in `complexity-scores` signature. | Restore the `:threshold` opt on `complexity-scores` + the explicit-embedder threshold test. |

**Summary — 3 kept, 2 partial, 7 missing, 0 obsoleted.**

Emission-level assertion hardening (commits 9-11) survived the refactor — the
axis-vs-dimension rename left the guards intact. Everything else — weights in
fingerprint/params, synonym-provider settings validation, provider-readiness
gating, error propagation, batching, and their tests — was lost when the
5-dim refactor took `--theirs` during restack.

**Biggest gaps to port next:**

1. Re-collect per-dimension weights into the `parameters-map` + fingerprint
   (commit `2da27266b40`).
2. Port `validate-synonym-config` + `:setter` on `ee-complexity-synonym-provider`
   (commit `9a49c794796`).
3. Wire `semantic.embedding/openai-config-problem` into complexity's embedder
   resolution so `:meta.embedding-model` reflects readiness
   (commits `d1f107a40e9`, `66ba80b7740`).
4. Route `provider-embedder` through `process-embeddings-streaming` for
   batching (commit `f8397030a29`, `d7401ad2f92`).
5. Restore the four missing tests: empty-batch, empty-streaming-result,
   openai-blank-base-url, explicit-embedder threshold.
