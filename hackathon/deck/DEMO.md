# Riley demo: semantic duplicates + embedding map

Throwaway instances of Riley's branch `hackathon-2026-semantic-duplicates` (PR #82899), built from the detached
worktree `/Users/krever/Projects/metabase/.claude/worktrees/riley-duplicates` at **`d0c7bb95e9`** ("color clustering").
Scripts are in `hackathon/deck/demo/`. Everything local stays in `riley-duplicates/local/`.

## Northwind (:3050)

Owner: Agent J. Verified 2026-09-23 20:15 UTC.

### Start

```bash
# from the harness worktree root. The frontend is already built in riley-duplicates, and it MUST be the EE edition:
#   (cd riley-duplicates && bun install && bun run build:cljs && MB_EDITION=ee bun run build:js)
# Without MB_EDITION=ee you get the OSS frontend, and Monitor shows a "needs Pro" upsell even though the token has
# semantic_search.
DEMO_STORE=pgvector DEMO_EMBED_MODEL=snowflake-arctic-embed2 DEMO_EMBED_DIMS=1024 \
  hackathon/deck/demo/launch.sh northwind        # foreground; prints READY: http://localhost:3050
# only the first time, on a fresh app DB (in a second shell, once READY):
DEMO_STORE=pgvector bash hackathon/deck/demo/load-northwind.sh
```

- **Login**: `demo-admin@example.com`, password in `riley-duplicates/local/demo-northwind-pg/.admin-password`.
- **Store**: pgvector DB `mb_demo_northwind_vec` in the `semantic_search-postgres-1` container. The launcher creates
  it if it's missing. App DB: H2 in `riley-duplicates/local/demo-northwind-pg/`. The corpus is B's golden northwind
  set (235 entities).
- **Duplicates**: they're computed by a backfill job that otherwise runs daily at 03:17 UTC. After loading, trigger it
  once, either with the button on the page below or by
  `POST /api/ee/semantic-search/related-questions/backfill` as admin. Expected result: `succeeded`, 184/184 questions,
  **4 pairs**.

### Seeded demo content (J, 2026-09-23 20:31 UTC)

`python3 hackathon/deck/demo/seed-riley-demo.py` (idempotent) adds the collection **"Demo: map + duplicates"** with
10 questions on real tables (`fct_shipments`, `fct_subscriptions`), then rebuilds the pairs. If the backfill says
"has not caught up", the last new cards are still being embedded: wait ~15 s and trigger it again.
- **Cluster for the map**: 6 shipping-delay questions (Late deliveries by carrier, Average delivery delay by region,
  Shipments delivered late last week, On-time delivery rate over time, Carrier delay breakdown, Delayed shipments by
  warehouse). They average 0.65 cosine similarity with each other against 0.40 across all questions, and each one's 3
  nearest neighbours are in the group, together with the corpus's own *On-time delivery rate by carrier*.
- **One question with 3 duplicates**: *Monthly recurring revenue by plan* ↔ *MRR by subscription plan*, *Monthly
  recurring revenue per plan (copy)*, *Recurring revenue each month by plan*. All 6 pairs among the four are found.
- The backfill result after seeding: **194 questions, 12 pairs** (the 4 cross-lingual pairs, the 6 MRR pairs, and 2
  shipping pairs: *Late deliveries by carrier* ↔ *Shipments delivered late last week* and ↔ *Delayed shipments by
  warehouse*).

### Focused map (J, 2026-09-23 20:45 UTC)

With the whole golden corpus the map is **one cluster, one colour**. Riley's map runs UMAP to 2D and colours with
DBSCAN (eps = 4 × median nearest-neighbour distance), and ~120 overlapping business questions form one continuous sheet.
`python3 hackathon/deck/demo/focus-riley-map.py --apply` adds 3 more tight topics (HR attrition, support tickets, ad
spend; 6 questions each) and **archives the other 101 corpus questions**, keeping the demo collection and the 8
cross-lingual duplicates. The ids are in `riley-duplicates/local/demo-northwind-pg/archived.json`, and `--restore`
unarchives them all.
- The map now has **36 points in 5 clusters**: shipping delays 6, HR attrition 6, support tickets 6, MRR 4, and
  ads + the cross-lingual customer questions 14. This was checked by replaying Riley's exact UMAP (seed 42) + DBSCAN
  in node on the live `/projection` vectors; the browser view itself isn't checked.
  `--drop-crosslingual` gives 28 points and 5 clusters of 6/6/6/6/4, but loses the cross-lingual pairs.
- Duplicates now: **111 questions, 15 pairs**: MRR by plan and its 3 duplicates, the 4 cross-lingual pairs, and
  natural pairs inside topics (e.g. *Ad spend by campaign* ↔ *Marketing budget used vs planned*).

### Click path

1. **Potential duplicates**: `http://localhost:3050/monitor/related-questions` (Monitor → Related questions). Lead with
   *Monthly recurring revenue by plan* (3 duplicates). Then the four cross-lingual pairs, each the same question in
   two languages:
   - Customer acquisition cost by channel ↔ Koszt pozyskania klienta
   - Average review rating by product ↔ 商品レビュー平均評価
   - Zwroty według kategorii produktu ↔ カテゴリ別返品率
   - Nowi klienci miesięcznie ↔ 新規顧客数の推移
2. **On a question**: open e.g. *Customer acquisition cost by channel*, then the info sidebar → Overview → **Duplicates**
   card (after Fields).
3. **Embedding map**: `http://localhost:3050/data-studio/embedding-map`. 36 saved questions (after the focus step) projected
   from their 1024-d vectors, in 5 coloured clusters: shipping delays, HR attrition, support tickets, MRR, ads/customers.

### Why these settings (findings, not tuning)

- **pgvector, not SQLite.** Riley's embedding map (`GET /api/ee/semantic-search/projection`) reads pgvector only and
  returns no points on the sqlite-vec1 store. On SQLite the duplicates backfill fails with "The SQLite semantic index
  has not caught up with saved questions": it expects 184 eligible questions, 75 of which are built-in Usage-analytics
  cards the index never holds, and the store has 109. Riley's pgvector path already excludes those. Both are bugs in
  Riley's SQLite path.
- **arctic, not all-minilm.** With all-minilm the backfill found **0 pairs**, even for *Revenue* vs *Copy of Revenue*,
  which scores 0.849 on the stored vectors against Riley's 0.83 threshold. The backfill re-embeds each question's
  title and description as a query, which scores lower. minilm is also English-only: its closest pairs are unrelated
  Japanese/Polish titles. Riley tuned the threshold with the arctic family. The threshold is unchanged.
- **Not found even with arctic**: the golden corpus's deliberate same-language copies (*Revenue*, *Revenue (old)*,
  *Copy of Revenue*). Worth saying out loud if someone asks: at 0.83 it catches translations, not stale copies.

### Stop

Ctrl-C in the launcher shell (or kill the JVM whose cwd is `riley-duplicates`). The app DB, the admin password and the
pgvector DB stay, so the next start needs no reload or backfill.

## Stats (:3051)

**Status: not yet booted** (H, 2026-09-23). `mb_stats_demo` is restored and guarded; the launch is waiting on the
result_metadata issue below. Stats data is company-internal: screenshots go only in `local/`, and check with Voytek
(via F) before real item names are shown to an audience.

### Start

```bash
# once: a NEW app DB from B's pristine dump + outbound guards (refuses to overwrite; never touches mb_stats_real)
hackathon/deck/demo/restore-stats.sh
# boot (pgvector store; arctic, as for northwind: minilm finds 0 duplicate pairs)
DEMO_STORE=pgvector DEMO_EMBED_MODEL=snowflake-arctic-embed2 DEMO_EMBED_DIMS=1024 hackathon/deck/demo/launch.sh stats
# indexing ~22k docs through the shared Ollama takes a while; watch progress:
curl -s -H "X-Metabase-Session: <admin session>" localhost:3051/api/ee/semantic-search/status
# then build the duplicate pairs (admin), and poll until it succeeds:
curl -s -X POST -H "X-Metabase-Session: <admin session>" localhost:3051/api/ee/semantic-search/related-questions/backfill
curl -s -H "X-Metabase-Session: <admin session>" localhost:3051/api/ee/semantic-search/related-questions/status
```

Login: `demo-admin@example.com`, with the password in `riley-duplicates/local/demo-stats-pg/.admin-password`.

### Click path

1. Duplicates: **/monitor/related-questions**, the table of likely-duplicate question pairs (Riley's 0.82 threshold,
   unchanged).
2. Embedding map: **/data-studio/embedding-map**, every saved question placed by meaning (pgvector only).

### Known issues

- **Legacy `result_metadata` on the Stats snapshot** (found by B): for many cards, semantic search throws
  `Invalid input … :model/Card {:result_metadata … disallowed key` and silently falls back to appdb. Every key of the
  failing column entries is reported (base_type and field_ref too), so stripping single keys won't do. Proposed fix
  for this local copy only: back up `(id, result_metadata)` into a table, then `UPDATE report_card SET
  result_metadata = NULL` (Metabase recomputes it when a question runs). Not applied yet. After boot, grep
  `metabase.log` for "Error executing semantic search" and "disallowed key" during the backfill and the clicks.
- **sqlite store** (J): the embedding map returns no points, and the backfill fails with "SQLite semantic index has not
  caught up" (it counts the 75 Usage-analytics cards the index never holds). Use pgvector for the demo.

### Stop

Ctrl-C the `launch.sh` terminal. The app DB (`mb_stats_demo`) and vector DB (`mb_demo_stats_vec`) stay for the next
boot. `restore-stats.sh --recreate` rebuilds the app DB from the dump.
