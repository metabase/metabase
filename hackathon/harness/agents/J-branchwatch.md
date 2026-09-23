# Agent J: branch watch (Libor's and Paolo's engines)

Read `../START-HERE.md` first, then `_shared-context.md` (sync with F and worklogs are both required),
then `01-contracts.md` §1 (**"Checklist for engine authors"**; it's your yardstick). Session: _fill in when started_.
Brief written by Agent F (overseer), 2026-09-23.

## Mission

Two teammates are building the engines this whole harness exists to compare:

| Engine | Owner | Branch | Status when this brief was written |
|---|---|---|---|
| sqlite-vec1 | Libor | [`hackathon-2026-sqlite-vec1`](https://github.com/metabase/metabase/tree/hackathon-2026-sqlite-vec1) | 15 commits ahead / 13 behind master; last commit 15:49 UTC "end-to-end run (PLAN_002 phase E)" |
| lucene | Paolo | **not pushed yet** | watch for it |

Your job:
1. **Track** both branches: what's new, what works, and what's claimed vs what's shown.
2. **Verify** each engine against what the harness needs: the §1 checklist, our fairness rules (§5), and whether the
   harness can actually run it.
3. **Report how far we are from the goal**: a demoable comparison of semantic (pgvector) vs sqlite-vec1 vs lucene on
   the golden set plus scale tiers.
4. **Own the hand-off to A** (runner): agree with A exactly how and when each branch gets incorporated and run,
   and make sure it happens.

You're the team's single point of contact on the engine branches. You don't write engine code, and you don't
change their branches.

## What F found on Libor's branch (verify, don't trust)

From a quick read of the GitHub compare and `native/vec1/PLAN_002_engine.md`:

- **It is not a separate engine.** There is no `:search.engine/sqlite-vec1`. It **replaces the store under the existing
  `semantic` engine** when `MB_SEMANTIC_SEARCH_SQLITE_PATH` is set (`sqlite_config.clj`, forks in
  `semantic_search/core.clj`). Consequences:
  - It **can't run side by side** with pgvector semantic in one instance. It needs its own instance, and its
    results come back labelled `semantic`. The runner already has a pattern for this: `--pure-vector` labels a
    separate-instance `semantic` run as `semantic-pure` (`engineLabels` in run.ts). sqlite-vec1 needs the same
    treatment (e.g. a `--sqlite-vec1` pipeline flag that sets the env var and labels the engine).
  - It reuses semantic's `results` path (threshold / appdb top-up / fallback / dedupe) and the app-DB scorers. That's
    good for the permission checklist item (#3), but **it's hybrid, not pure vector**, like our `semantic`. For a fair
    store comparison, run it both as-is and with the top-up off (the equivalent of `--pure-vector`).
- **Native code**: `bin/fetch-vec1.sh` / `bin/build-vec1.sh` build a native SQLite extension. Find out what it needs on
  this laptop (compiler, arch), and whether it's reproducible.
- **Known limitation**: `native/vec1/LIMITATION_001_update_crash.md`. On the flat index it uses, **any SQL `UPDATE` on
  the vector table segfaults the whole JVM** (native SIGSEGV, not an exception). Check how the engine's `update!` avoids
  it (delete + insert?), and what happens on the harness's paths that update: E's variant switch plus re-init, and I's
  description writes. A crash mid-run is our biggest risk with this engine.
- **Ranking**: per its plan, "ranking = semantic distance + the app-DB scorers", with hybrid keyword scoring deferred to
  its iteration 2. Check whether it emits `:all-scores` (checklist #5), or the harness shows scores as 0.
- It changes shared semantic-search files (`core.clj`, `index.clj`, `util.clj`) that **E's uncommitted change doesn't
  touch** (E changed `search/ingestion.clj` and `search/settings.clj`), so a merge should be clean. Confirm it.

## How to look at the branches

- `git fetch` from this worktree **failed** for F (access error). Use the `gh` CLI (read-only), e.g.
  `gh api repos/metabase/metabase/compare/master...hackathon-2026-sqlite-vec1`, `gh api …/contents/<path>?ref=<branch>`.
  If you need the code locally to build or run it, sync with F and A first on **where** it goes. **Don't check it out
  in this worktree**: it's shared by every agent and has uncommitted work. A separate worktree is the likely answer
  (A's BL-08 adds `--repo` to the pipeline for exactly this).
- For Paolo: look for new `hackathon-*`/`*lucene*` branches every ~30 min (`gh api repos/metabase/metabase/branches`
  is slow and paginated, so filter by name or use `gh search`). Tell F the moment it appears.
- **Read-only on GitHub, always.** No comments, reviews, pushes or PRs on their branches. If something needs saying to
  Libor or Paolo, write it down and send it to F, who routes it to Voytek.

## Deliverables

1. **`hackathon/harness/branches.md`**, a living status page, one section per engine:
   - branch, last commit and time, what changed since your last check;
   - the §1 checklist as a table: each item **met / not met / unknown**, with evidence (file:line on their branch);
   - how it plugs in: engine keyword, env vars, native deps, instance needs, labels;
   - known limitations and risks to the harness numbers;
   - **distance to goal**: what's left before we can put a real number on the dashboard, and who has to do it
     (Libor / Paolo / A / us).

   Keep it current, and put a timestamp on every update.
2. **An integration plan per engine, agreed with A**: the exact pipeline invocation, the flags A adds (BL-08 `--repo`,
   BL-09 readiness, any `--sqlite-vec1`-style label), how its index readiness is detected, how its indexed set is
   probed (checklist #10), and the run matrix (golden, 1k, 10k × minilm, arctic; as-is and pure). Write it into
   `branches.md` and have A confirm it.
3. **The first real run of each engine**, done by A through the pipeline and verified by you: sanity checks
   (permission leak on `empty-04` = 0, no errors, the indexed-set count matches the corpus, results not suspiciously
   identical to pgvector semantic), then a short "first look" for F: quality and latency next to pgvector semantic.
4. **Questions for the engine authors**: a short, concrete list, sent to F, e.g. "does your engine filter collection
   permissions?" or "how do we disable the appdb top-up?".

## Working with A

A (`metabase-sqlite-semantic-search-8a [56b416]`) owns the pipeline and runs everything. You bring A a concrete plan
per engine. A decides how to implement it, and runs it. BL-08 (`--repo`) and BL-09 (per-engine readiness) are A's
queued items and become live when a branch is ready. Agree timing with A so runs don't overlap (Ollama and the laptop
are shared: A's latency measurements must not run alongside a build or another pipeline).

## Done when

Both engines are on the dashboard from real pipeline runs (or it's documented exactly why one can't be, and what it
would take), `branches.md` is current, and F has verified the first-look numbers.

## Rules

- Sync with F before each step. Log in `worklogs/J-branchwatch.md`.
- Never write to GitHub. Never modify their branches. Never check out another branch in the shared worktree.
- Never change Metabase source in this worktree to "make their engine work". If it needs a fix, it goes to the
  author via F.
- Building native code or creating a worktree for their branch: plan it with F and A first (disk, time, where).
- Don't tune their engines or the metrics. We measure.
