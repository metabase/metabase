# Worklog: Agent K (demo deck)

Session: `metabase-sqlite-semantic-search-e3 [282a46]`
Brief: `agents/K-deck.md`

## 2026-09-23 — started
- **What**: read `START-HERE.md`, `_shared-context.md`, my brief. Created this worklog.
- **Why**: onboarding per START-HERE.
- **How**: n/a
- **Open**: sync with F on the outline before building anything.

## 2026-09-23 15:40 — scaffold + sources + outline sent to F
- **What**: created `hackathon/deck/` (`index.html`, `deck.css`, `vendor/reveal.js` 5.2.1 from the npm tarball, trimmed to dist + plugin; `vendor/mermaid.min.js` 11.4.1 from jsdelivr). Added my session to START-HERE's roster and my brief.
- **Why**: F approved the scaffold (offline-capable, no build step).
- **How**: sources read: brief §Alternatives, `branches.md` (sqlite-vec1 + lucene), Libor's `PLAN_002_engine.md` (sqlite-vec1-libor worktree), `local/run-semantic-search.sh` + `semantic-search.env`, `00-plan.md` roster, I's recommendation + coverage plan. Slack (read-only), #hackathon-sqlite-semantic-search (C0C3C3KLBQ9): Riley's thread ts 1790173383.572829 → branch `hackathon-2026-semantic-duplicates`, PR #82899, head `5d4df152`; 3 features (question sidebar Duplicates card, /monitor/semantic-duplicates, /data-studio/embedding-map). Riley's plan doc (fetched via gh api, into the scratchpad only): threshold 0.82, and duplicates.clj supports pgvector + SQLite vec1. Alternatives threads 2026-09-22 (Riley, Libor, Voytek). Rendering not yet checked (slides.md not written).
- **Open**: waiting for F's OK on the outline; the Pokémon dataset's origin is unknown; the gh api partly timed out on Riley's api.clj / duplicates_backfill.clj (retry later).

## 2026-09-23 19:25 UTC — slides.md v1 written and rendered
- **What**: `hackathon/deck/slides.md` has 17 slides (Riley's section is 1 slide + 3 vertical), each with speaker notes. Also `deck.css` (columns, badge, org grid). F's approved outline, plus F's edits: the coverage slide, verified hook numbers with run ids in the notes, lucene file:line, and the lucene migration step.
- **Why**: F go-ahead on the outline.
- **How**: verified lucene at `917611d56a`: RRF weights at `lucene/query.clj:38-43`, sync at `lucene/sync.clj:24` (tick-seconds 10). Served with `python3 -m http.server 8077 -d hackathon/deck`. Playwright at 1280×720: 17 slides, 3 mermaid SVGs rendered, 0 leftover mermaid code blocks, 17 `aside.notes`, the only console error is favicon 404. Screenshots checked: alternatives table, org grid (replaced the mermaid org chart, which was too small to read), setup columns (fixed overflow; shortened the env var on the slide), SQLite diagram, coverage table. **Not verified**: the speaker view window itself (`s` opens a popup; I didn't drive it in Playwright), and offline load with the network actually off.
- **Open**: placeholders `{{TBD}}` for stats-real (Evals how + headlines), Mike, and the conclusions (drafted, marked DRAFT for F). Pokémon + Stats-on-screen are with Voytek. Next: the demo instance plan (a separate sync with F).

## 2026-09-23 19:35 UTC — F's conclusion edits; speaker view + offline verified
- **What**: `slides.md` conclusions reworded per F: "same vector-search quality, no pgvector needed"; the embedder claim marked "(research)" in the notes; next steps gain "fair keyword test for Lucene on Postgres" (BL-43). The 10k latency bullet gets "median; the slow tail is within noise".
- **How**: Playwright with every non-localhost request aborted (`page.route`): 0 external requests, 17 slides, 2 mermaid SVGs (the org chart is HTML now), 17 notes. Every src/href in index.html resolves to a local file, and the theme font is local (`theme/fonts/source-sans-pro`). Speaker view (`s`) opens "reveal.js - Speaker View" with 2 iframes and follows navigation (showed slide 2's notes after ArrowRight).
- **Open**: demo-instance plan goes to F next.

## 2026-09-23 19:45 UTC — demo plan approved; asks sent
- **What**: F approved two instances, :3050 northwind (H2 + apply.ts) and :3051 Stats (a new DB `mb_stats_demo` restored from B's snapshot, with all of B's outbound guards). The sqlite-vec1 store on both. Riley's threshold stays unchanged; I report duplicate counts per corpus. Stats screenshots go in local/ only. Asked J for the worktree `.claude/worktrees/riley-duplicates` @ 5d4df152; asked B about warehouse reuse, the restore + guards, and the migration level; asked A for a slot after the sqlite golden re-times (queue holds for the build and each index/backfill). The vec1 dylib will be copied from Libor's worktree with a sha check.
- **Why**: F's go-ahead; J owns fetching, B owns the corpus/snapshot, A owns the queue.
- **How**: messages only; nothing created yet.
- **Open**: replies from J, B, A. The Pokémon question is with Voytek. Mike's content is pending.

## 2026-09-23 19:55 UTC — B's answers (Stats restore recipe)
- **What**: B answered.
  - **Warehouse**: reuse northwind_warehouse read-only. Never re-run warehouse.sql (it starts with DROP SCHEMA CASCADE). apply.ts refuses if "Northwind Warehouse" already exists; a fresh H2 app DB is fine.
  - **Stats**: `createdb mb_stats_demo`, `CREATE EXTENSION citext`, `pg_restore --no-owner --no-privileges < local/stats-real/appdb.dump`. Restore from the PRISTINE dump only, never mb_stats_real. Encryption key comes from manifest.json `appdb_encryption_key`, read without printing.
  - **Guards**: `local/stats-real/guards.sql` (idempotent; expect 0 / 0 0 0 after), plus the launcher env MB_ANON_TRACKING_ENABLED/CHECK_FOR_UPDATES/SEND_NEW_SSO_USER_ADMIN_EMAIL=false.
  - **Admin**: via MB_CONFIG_FILE_PATH users entry with is_superuser true; I make my own password.
  - **Scheduler**: B found the pgvector index never filled with the scheduler off. The sqlite store indexes outside Quartz, but plan for the scheduler ON with the guards in place.
  - **Migrations**: the dump is at v64.2026-07-25T00:39:56. Check the branch knows it (`grep -c` in resources/migrations) before boot.
  - **Ports/data**: don't use 3041 or 3003. Some document bodies name real customers: everything stays in local/.
- **Open**: J's worktree, A's slot.

## 2026-09-23 19:45 UTC — refocused on slides (Voytek); demo work handed to F
- **What**: Voytek said to focus on the slides and delegate the rest via F. I stopped the demo-instance work and asked to release my queue hold 193202-6b78. Handed F the state: riley-duplicates worktree (J) with Libor's vec1.dylib copied (sha matches), clojure -P done, the migration + UPDATE checks, the FE not built, and draft UNTESTED scripts in `hackathon/deck/demo/`.
- **What (slides)**: Voytek flagged the SQLite and Lucene diagrams as inconsistent. Both now share one skeleton: Search/Metabot → semantic engine → [vector] store, plus "appdb top-up + fallback" (both use the same `results` path). Lucene alone adds "keyword, RRF → appdb keyword". The app-DB table/sync detail is in the notes only. Kept Voytek's own edits (removed pgvector branch, new SQLite subtitle).
- **How**: re-read slides.md before editing (Voytek is editing it too). Playwright screenshots of both slides.

## 2026-09-23 19:55 UTC — Riley's head moved
- **What**: J moved the riley-duplicates worktree to Riley's new head `d0c7bb95e9` ("color clustering"; no vec1/sqlite/deps/migration/package.json changes, vec1.dylib untouched). Updated the sha in the Riley slide's notes; no other change to slides.md (Voytek is editing it).

## 2026-09-23 20:05 UTC — setup slide shows pgvector's real cost (Voytek)
- **What**: rewrote the Setup slide in `slides.md` (+ `deck.css` wide column). Each engine gets "Set up once" + "Run forever". pgvector's once-steps: a Postgres server (new if the app DB is MySQL/H2), a superuser running CREATE EXTENSION vector, network + credentials → MB_PGVECTOR_DB_URL. Its forever list: a second DB (backups, upgrades, monitoring), pgvector↔Postgres versions, pgvector-only jobs. sqlite-vec1: one env var / a local file. Lucene: nothing (auto migration) / a local index. The embedder + license token are moved to a footer ("all three").
- **How**: facts checked. The superuser error text is at `semantic_search/index.clj:552`; the jobs are in `semantic_search/task/*` (indexer, index_repair, index_cleanup, metric_collector, usage_trimmer) + store health per PLAN_002. The notes carry the honest caveat (a Postgres app DB with pgvector available shrinks the once-steps, but the forever part stays). Rendered in Playwright; the columns are aligned.

## 2026-09-23 20:20 UTC — stats-real numbers withdrawn (F)
- **What**: F withdrew the stats-real-v1 numbers (run 20260923-200822-424419): 48 of ~60 semantic queries silently fell back to appdb. They were never put in the deck (grep confirms). stats-real stays `{{TBD}}` until F's go. Voytek: Riley's demo runs on pgvector (relayed to F); the Riley slides are unchanged.

## 2026-09-23 20:45 UTC — F's final numbers into the notes
- **What**: `slides.md` speaker notes only (Voytek owns the slide text). Evals notes: 10k p50 pgvector 292 / lucene 238 / sqlite-vec1 222 ms (runs 20260923-175722-e82939 / 20260923-203908-4e3f15 / 20260923-174357-3004e3; full ids resolved from harness_run, all scale-10000-seed-42), store-vs-store ~27% with identical result sets (overlap 1.000 @1000), index sizes 50/117/156 MB. Lucene notes: startup race until the hourly repair (lucene/core.clj:60). stats-real stays {{TBD}}.
