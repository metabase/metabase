# Agent E: embedding text variants

Session: `metabase-sqlite-semantic-search-8a [36af46]`. Brief: `hackathon/harness/agents/E-embedtext.md`.

Times before 10:33 are approximate (backfilled).

## 2026-09-23 ~10:05 — Investigated "we only embed name and description"
- What: Read the code only, no changes. Main files: `src/metabase/search/ingestion.clj` (`embeddable-text`), each model's search spec (`:search-terms`), `semantic_search/index.clj`, `gate.clj` and `embedding.clj`.
- Why: Another agent reported that semantic search embeds only name and description. Voytek asked why, and what changing it would mean.
- How: Confirmed the report. The embedded text is `[model]` + `:search-terms` − `:embedding-exclude`. For most models that is name + description; collections and documents embed only their name, and document bodies are left out on purpose (#75841).
  - Reason: `embeddable_text` was split from `searchable_text` in #64693, but it still reuses the search-term list that was built for keyword search.
  - Why nobody noticed: search is hybrid. The keyword arm does see SQL through `text_search_with_native_query_vector`, which hides the gap.
  - Cost of a change: the gate hashes the whole document (`gate.clj:66`) and the embedding cache is keyed by exact text, so any text change re-embeds every document.
  - Risks: documents over the token budget are silently dropped (`embedding.clj:116`, BOT-1742), and `all-minilm` only reads about 256 tokens.
  - Not verified: whether Libor's and Paolo's engines consume `:embeddable_text`. Their code isn't in this worktree.

## 2026-09-23 ~10:12 — Flagged a conflict with the TypeScript / outside-in direction
- What: No changes. Reported to Voytek which of my suggestions and which parts of the harness plan conflict with the new direction from session a8.
- Why: The peer message asked for conflicts to be flagged before continuing.
- How: Two of my suggestions were Clojure changes, the `:embedding-terms` spec key and the text-variant axis. In the plan, A-runner's in-process runner, the `time-waterfall` timings and the contracts' `get-configured-model` call conflict too.
- Open (resolved): Voytek then explicitly asked for the opt-in Clojure change, as a new axis.

## 2026-09-23 ~10:20 — Joined the hackathon setup as Agent E
- What: Created `agents/E-embedtext.md`. Edited `00-plan.md` (added axis 4 and row E in the work breakdown) and `01-contracts.md` (a §4 amendment adding the `harness_run.embedding_text` column, and §5 rule 2a).
- Why: Voytek asked me to join as the owner of the new axis.
- How: Changed the plan and contracts with scripted text replacements and checked the insertions with grep. Chose to record the variant **per run** rather than as a column in every result table: one run = one variant, like the embedder. This keeps the result tables' primary keys unchanged.
- Open (resolved): D applied the column in `sql/01-schema.sql` and the live harness DB; the `02-views.sql` views use it. See the 10:34 entry.

## 2026-09-23 ~10:22 — Sent the FYI to the runner and data app
- What: Sent the same message to sessions 8a [56b416], c5, 02 and b4.
- Why: I didn't know which session is A or D, so everyone got it, with the asks for A and D marked.
- How: SendMessage. Delivery was confirmed; I have no replies yet.

## 2026-09-23 ~10:30 — Built the opt-in setting and the variant-aware embedding text
- What:
  - `src/metabase/search/settings.clj`: new `embedding-text-variants` set and the admin setting `search-embedding-text-variant` (`:baseline` default | `:context` | `:context-sql`). It rejects unknown values with a 400.
  - `src/metabase/search/ingestion.clj`: `embeddable-text` gets a 2-arity form `[m variant]`; the 1-arity form reads the setting. `->document` now passes `(merge m fn-results)`, so `:native_query` is visible.
  - `test/metabase/search/ingestion_test.clj`: added `embeddable-text-variant-test` and `search-embedding-text-variant-setting-test`.
- Why: The text can only be changed inside ingestion. Making it an admin setting lets the runner switch variants from outside (PUT the setting, `POST /api/search/re-init`, poll `/api/ee/semantic-search/status`).
- How:
  - `context` uses only columns the specs already select (collection_name, database_name, table_schema, table_display_name, table_description, a collection's description, display), so the app DB does no extra work.
  - `context-sql` also adds the native SQL, cut to 1000 characters.
  - Column names from `result_metadata` are left out, because they would need a change to the ingestion query.
  - Dead end, fixed: the first version dropped every repeated value, including in the baseline lines. That would have changed the baseline text for items whose name equals their description, and re-embedded them. Repeats are now dropped only from the added lines. A test covers this.
  - Verified: `./bin/test-agent :only '[metabase.search.ingestion-test]'` → 13 tests, 37 assertions, 0 failures. `./bin/mage kondo` on the 3 files → 0 errors, 0 warnings.
  - Not verified: the semantic_search index tests (they need pgvector; they should be unaffected because the baseline text is unchanged), an end-to-end re-init on the live instance, and `fix-modules-config` (no new cross-module requires, so I skipped it).
- Open: The local instance on :3002 is still running the old code. Voytek needs to choose: restart it, hot-load the two namespaces over nREPL, or wait until the runner is between runs. Nothing is committed.

## 2026-09-23 10:34 — Agent D confirmed axis 4 is live in the data app
- What: No changes on my side. D (session 02) reports that `harness_run.embedding_text` is applied, the writer takes `startRun({embeddingText})`, every view is keyed on the latest run per (corpus, scale, embedder, embedding_text), and there is a new "Embedding text" dashboard tab, including the keyword-engine sanity check.
- Why: This closes D's open item from the 10:20 entry.
- How: Taken from D's message. I haven't checked the dashboard myself.
- Open: The runner (A) still needs to read `GET /api/setting/search-embedding-text-variant` and pass it as `embeddingText`. The instance on :3002 still runs the old code (Voytek's decision).

## 2026-09-23 10:39 — /simplify pass on the ingestion change
- What: `src/metabase/search/ingestion.clj`: SQL cut now uses `u/truncate`; removed a key check that could never change the output; `extra-lines` is bound once. `settings.clj`: the error message is now translated with `tru`. Fixed blank lines in the test file.
- Why: Findings from 4 review agents (reuse, simplification, efficiency, altitude).
- How: Re-ran `metabase.search.ingestion-test` (13 tests, 37 assertions, 0 failures) and kondo (0/0).
  - Skipped: moving the context field list into each model's search spec (about 15 files, too big for an off-by-default experiment; do it if a variant ships). Reading the setting once per batch (cached, about 1–3 µs per document, and the call sites are outside the diff). Replacing the custom setter (no shared helper exists; it matches `mfa-enforcement`).

## 2026-09-23 10:49 — Hot-loaded the change into :3002 (per Agent F)
- What: Loaded `metabase.search.settings` and `metabase.search.ingestion` into the running :3002 JVM over nREPL :50605. No restart, no variant change, no re-init. Added the 204 note to `agents/E-embedtext.md`.
- Why: Agent F relayed that Voytek delegated the decision. A restart needs the 1Password token (it fails without a TTY) and would drop D's in-memory CSP patch.
- How:
  - A (8a [56b416]) confirmed no run was in flight and is holding its smoke run.
  - Checked that nREPL :50605 is this worktree's JVM with MB_JETTY_PORT=3002 and that the setting didn't exist before the load.
  - Loaded with `./bin/mage -repl -p 50605` (`clj-nrepl-eval` isn't installed). In-JVM, the setting reads `:baseline` and the `:context` variant builds text.
  - From outside, as admin: `GET /api/setting/search-embedding-text-variant` → **204, empty body**. That is standard for a setting on its default; `GET /api/setting` shows `value: null, default: "baseline"`. `/api/search?q=orders&search_engine=semantic` → engine semantic, 19 results.
  - The code is on disk, so a later restart picks up the same code.
  - Not verified: switching to a non-baseline variant plus re-init end to end. That was not requested; A's run will exercise it.
- Open: A must record an empty or 204 value as `baseline`.

## 2026-09-23 10:50 — DONE (build)
- What: Agent F confirmed E is done and checked the setting and search from outside. Marked "DONE (build)" in `00-plan.md`'s work breakdown.
- Why: Everything in the brief is delivered: the setting, the variant-aware text, tests, the /simplify pass, the plan and contract updates, and the change live on :3002.
- How: The code stays **uncommitted**; committing is Voytek's call.
- Reopen trigger: A records `embeddingText` and switches variants in a real run. If that surfaces a problem, E picks it up.
