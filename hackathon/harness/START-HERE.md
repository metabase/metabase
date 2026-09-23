# Start here: setup for a new harness agent

You're joining a hackathon team of Claude sessions building a **search comparison harness** for Metabase. This page
gets you from zero to working on a task in about 10 minutes. It was written by Agent F (overseer).

## 1. What this project is (60 seconds)

We compare search engines inside Metabase: the shipping **semantic** engine (pgvector + Ollama), two keyword references
(**appdb**, **in-place**), and soon **sqlite-vec1** (Libor) and **lucene** (Paolo). We load a hand-made catalogue of
~234 items, ask every engine the same 56 questions with known right answers, record what they return and how fast,
score it, and show it in a Metabase dashboard.

Pipeline: `corpus-gen/` (B) → `scenarios/` → `runner/` (A) → `metrics/` (C) → `results/` writer (D) → Postgres
`harness` DB → `sql/02-views.sql` → dashboard on :3002.

**Team rules**: TypeScript, not Clojure. Touch Metabase source as little as possible (E's opt-in setting is the only
exception). Measure from the outside, over HTTP.

## 2. Read, in this order

1. `agents/_shared-context.md`: the stack, conventions, non-goals, and **worklog format (required)**.
2. `00-plan.md`: design and matrix. Skim it.
3. `01-contracts.md`: the interfaces between pieces. Read the sections your task touches.
4. `BACKLOG.md`: the list of things to fix, and how to claim one.
5. Your own brief, if you have one (`agents/<letter>-*.md`).
6. The worklog of whoever owns the code you're about to touch (`worklogs/`).

## 3. Who's who

| Agent | Role | Session | Status |
|---|---|---|---|
| A | Runner + pipeline, **owns the harness end to end** | `metabase-sqlite-semantic-search-8a [56b416]` | active |
| B | Corpus + scenarios (now: corpus from a real instance) | `metabase-sqlite-semantic-search-cb` (resumed) | active |
| C | Metrics library | (session closed) | done |
| D | Results store + data app | `metabase-sqlite-semantic-search-02` | done, available for questions |
| E | Embedding-text variant (Metabase setting) | (session closed) | done |
| H | Bugfixer: works through `BACKLOG.md` | `metabase-sqlite-semantic-search-74` | done |
| I | Embedding-text research: what to embed (SQL → plain English, …) | `J-researcher` [4886d0] (this is Agent I, despite the name) | brief: `agents/I-embedresearch.md` |
| J | Branch watch: Libor's/Paolo's engines vs our needs, integration with A | `metabase-sqlite-semantic-search-35 [3e9092]` | brief: `agents/J-branchwatch.md` |
| K | Demo deck (reveal.js) + demo runbook | `metabase-sqlite-semantic-search-e3 [282a46]` | brief: `agents/K-deck.md` |
| F | **Overseer**: assigns, verifies, briefs Voytek | `Typescript preference for agents` (overseer F) (names can change: if a send fails, run ListAgents) | active |
| G | Explainer (reading guide + simpler dashboard) | `G-explainer` (bg) | done, reopened for small items (owns `results/src/dashboard*.ts`, `glossary.ts`) |

Voytek is the human. **Don't ask him things another agent or the code can answer.** Route questions to F.

## 4. The rule that matters most: sync with F

**Before you start any task, message F** (`SendMessage` to `Typescript preference for agents` (overseer F)). Say which task
(e.g. `BL-06`), what you plan to change (files), and how you'll verify it. **Wait for F's go-ahead.** F checks it doesn't
collide with A or another agent, and may re-scope it.

**When you finish**, message F with the evidence (the command and its output, or a query result). F verifies it
independently before the item counts as done.

Also message F when you're blocked, when you find a new problem, or when you're about to do anything irreversible
(deleting data, dropping a DB, stopping an instance, committing).

## 5. How to pick and do a backlog task

1. Open `BACKLOG.md` and take the first item that is `todo` and whose `Needs` are done.
   - `doing — X`: someone has it. Skip it.
   - `queued — A`: it's in A's queue. Ask A (and tell F) before taking it.
   - "Agent G's area": take it only if F says G isn't running.
2. **Sync with F** (section 4). After the go-ahead, set the status to `doing — <your session name>`.
3. Fix only what the item says. Anything else you notice becomes a new item at the bottom of `BACKLOG.md`.
4. Verify it against the item's **Done when**. Paste the evidence into your worklog.
5. Report to F. After F confirms, set the status to `done — <session>, <time>`.

## 6. Your worklog

Create `worklogs/<letter-or-BL-agent>-<short-name>.md`, with your session name at the top. Append an entry for each
step as you go (What / Why / How / Open). Record what you did **not** verify. Log dead ends too. Format:
`agents/_shared-context.md` → Worklogs.

## 7. The running environment (don't break it)

| Thing | Where | Notes |
|---|---|---|
| Repo (worktree) | `/Users/krever/Projects/metabase/.claude/worktrees/metabase-sqlite-semantic-search` | Run everything from here. Never `cd` to the main checkout |
| Harness | `hackathon/harness/` | npm workspace; Node ≥ 22.18, `.ts` runs directly |
| Postgres + pgvector | container `semantic_search-postgres-1`, `localhost:55432`, `postgres/postgres` | Results DB: `harness` |
| Ollama | `localhost:11434` | `all-minilm` (384d), `snowflake-arctic-embed2` (1024d) |
| Metabase :3002 | shared instance + **data app** (dashboard id 12) | `dev@metabase.local` / `devdev1234`. **Don't restart it** |
| :8090 | frontend dev server for :3002 | runtime-only; see D's runbook in `agents/D-dataapp.md` |
| :3003 | golden-corpus instance (B) | don't stop it |
| :3004 | scale-10000 instance (A) | **don't stop it** |
| :3010–:3020 | instances from `pipeline.ts` run by hand | A's |
| :3041 | stats-real instance (B): sanitized Stats app DB `mb_stats_real`, `local/run-stats-real.sh` | B's; **internal data, local only** |
| :3021–:3040 | instances from the **run queue** (`runner/src/queue.ts`, assigns the port itself) | whoever queued the job |
| Ports 3000, 3001, 8080 | unrelated personal projects | never touch them |

Useful commands (from `hackathon/harness/`):

```bash
npm run typecheck                  # all workspaces, must exit 0
npm test                           # metrics unit tests
(cd results && npm run check)      # runs every dashboard card through the API, 0 errors expected
docker exec semantic_search-postgres-1 psql -U postgres -d harness -c "select run_id, corpus_id, finished_at from harness_run order by started_at"
```

The real golden run to test against: `20260923-145150-29002c` (corpus `northwind-golden-v1`).

### Running pipeline jobs: use the queue (BL-37)

Don't launch `pipeline.ts` by hand or build chains of runs: append a job to the queue, and the one daemon (A's,
`node src/queue.ts run --slots 2`) runs it. From `hackathon/harness/runner/`:

```bash
node src/queue.ts add --kind quality --label <short-label> --by <your letter> -- <pipeline args, no --port>
node src/queue.ts add --kind latency --label <label> --by <you> -- <args>   # runs alone: its timings are clean
node src/queue.ts add --kind hold --label <label> --by <you> [--max-min 20]   # reserve a window, e.g. an Ollama batch
node src/queue.ts release <job id>   # end your hold (it auto-releases after --max-min, with a warning)
node src/queue.ts pause | resume     # stop/allow new starts; running jobs are untouched (use for code-edit windows)
node src/queue.ts status             # pending / running / done, with ports and run ids
```

`quality` jobs run up to 2 at a time; `latency` and `hold` jobs run alone, and nothing queued behind them overtakes
them. A job loads `runner/src` when it **starts**, so only edit the runner while the queue is paused and nothing is
booting (ask A). Logs: `runner/queue/logs/<job id>.log`; every job's whole window (boot + index + runs) is also in the
`harness_job` table.

## 8. Never

- Commit, push, or open PRs (only Voytek decides; it's backlog item BL-22).
- Edit files outside your task, or another agent's area, without F's OK.
- Write Clojure or touch `src/`, `enterprise/` or `test/`.
- Change metric definitions, labels or the pgvector engine, or tune relevance.
- Stop, restart or reconfigure an instance you didn't start. Drop a DB without F's OK.
- Type passwords into browsers, or ask Voytek to read code.
