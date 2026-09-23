# Shared context — read before any harness agent task

**Repo**: `/Users/krever/Projects/metabase/.claude/worktrees/metabase-sqlite-semantic-search`
(a git worktree — run everything from here, never `cd` to the main checkout).

**Read first**: `hackathon/brief.md`, `hackathon/harness/00-plan.md`, `hackathon/harness/01-contracts.md`.
The contracts are frozen. If one is wrong, change it there and say so — do not work around it locally.

## Working local stack

A pgvector + Ollama + Metabase dev instance already works:

```bash
./local/run-semantic-search.sh        # boots it; auto-picks a free port, writes it to local/.port
./local/verify-semantic-search.sh     # index tables, doc counts, active engine, a scored search
```

- pgvector: `localhost:55432`, db `mb_semantic_search`, `postgres/postgres`, container
  `semantic_search-postgres-1`, pgvector 0.8.6
- Embedder: Ollama at `localhost:11434`, model `all-minilm`, 384 dims
- Metabase: port in `local/.port` (3002 unless taken), login `dev@metabase.local` / `devdev1234`
- Config: `local/semantic-search.env`
- License token comes from 1Password via `op`; it is already working on this machine.

Ports 3000 and 3001 belong to an unrelated personal project. Leave them alone.

## Codebase orientation

| Thing | Where |
|---|---|
| Engine multimethods | `src/metabase/search/engine.clj` |
| Smallest complete engine impl | `src/metabase/search/semantic/core.clj` |
| pgvector query, filters, scorers, waterfall | `enterprise/backend/src/metabase_enterprise/semantic_search/index.clj` |
| Scoring, incl. the appdb/in-store split | `.../semantic_search/scoring.clj` |
| Embedding providers + configured model | `.../semantic_search/embedding.clj`, `src/metabase/embeddings/provider.clj` |
| Corpus generator, latency benchmark | `dev/src/dev/search_perf.clj` |
| Recall methodology | `dev/src/dev/semantic_search/recall.clj` |
| Search settings | `src/metabase/search/settings.clj` |

## Conventions

- Clojure: follow `.claude/skills/clojure-write/SKILL.md`. Prefer the `clojure-eval` skill / nREPL
  over shell for evaluating code. Never use `clj -X:dev:test` directly — use `./bin/test-agent`.
- After any backend change that could move module boundaries: `./bin/mage fix-modules-config`.
- All harness code lives under namespaces you are assigned. Do not edit another agent's tree.
- Harness output and scratch data go under `hackathon/harness/` or `local/` (both gitignored-ish —
  `local/` is ignored, `hackathon/` is currently untracked).

## Sync with F (required)

Before starting any task, message Agent F (`Typescript preference for agents` (overseer F)) with the task, the files you'll touch
and your verification plan, then wait for the go-ahead. Report the evidence to F when you're done. New agents: read
`../START-HERE.md`.

## Worklogs (required)

Every agent keeps a worklog at `hackathon/harness/worklogs/<letter>-<name>.md` (e.g. `A-runner.md`).
Agent F (overseer) reads the worklogs, checks them against the repo, and briefs Voytek.

Append one entry for each meaningful step, as you go rather than at the end:

```markdown
## <YYYY-MM-DD HH:MM> — <short title>
- **What**: what you did, with the files touched (paths)
- **Why**: the reason or decision behind it
- **How**: approach, commands run, how you verified it (tests, output); say plainly what you didn't verify
- **Open**: blockers, questions for Voytek, anything left half-done (omit if none)
```

Put your session name at the top of the file. Log dead ends and reverted changes too.

## Non-goals for every agent

- Do not modify the pgvector engine's behaviour. It is the baseline; changing it invalidates the run.
- Do not implement the SQLite or Lucene engines. Libor and Paolo own those.
- Do not tune relevance. We are measuring, not improving.
