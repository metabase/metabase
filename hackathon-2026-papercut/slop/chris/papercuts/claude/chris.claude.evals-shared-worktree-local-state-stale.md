---
title: evals worktrees symlink .env files and caches into .evals-worktree-shared, where resolved secrets and snapshot caches go stale and a second, real cache lives elsewhere
slug: evals-shared-worktree-local-state-stale
kind: env-friction
impact: both
severity: medium
status: unknown
area: evals repo local setup: .env, .env-warehouses, .env-snapshots, .stats-encryption-secret-key symlinks; snapshots/home.py local_root; stats build --warehouse-root
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/3bdfd417-14a3-46c9-84f9-28a801ebd34e.jsonl
    lines: 266-320
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.78, tool_misuse: 0.69, misleading_signal: 0.67, user_correction: 0.93, codebase_trap: 0.42, flailing: 0.21, env_friction: 0.87}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/4ba68340-d63c-40cc-a449-6b56ac132245.jsonl
    lines: 1916-2055
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.79, misleading_signal: 0.63, user_correction: 0.91, codebase_trap: 0.81, flailing: 0.41, env_friction: 0.82}
---
## Summary
Each evals worktree symlinks `.env`, `.env-warehouses`, `.env-snapshots` and `.stats-encryption-secret-key` to `/Users/christruter/workspace/metabase/.evals-worktree-shared/`. These are resolved `op inject` outputs frozen on the day they were created (Aug 3 / Aug 26). Nothing flags them as stale. Three separate traps followed:
1. **Stale bucket name.** The agent built an architecture diagram with the snapshot bucket read from `.env-warehouses`. The user corrected it: "i think that bucket name is stale for the snapshots". 1Password's live value (`op read "op://Shared/evals-warehouse-snapshots/s3-bucket"`) was `metabase-evals-dumps`. Both local files still had the old account-scoped name.
2. **Two snapshot caches.** `.evals-worktree-shared/.snapshots/<dataset>/snapshot.json` holds July versions and looks like the cache. The real cache is `snapshots/home.py:local_root()` -> `~/Library/Caches/Metabase/snapshots/local/<dataset>/{current.json,versions/}`. The agent first concluded the pinned versions were "MISSING" (L1954).
3. **`--warehouse-root` wants a different layout.** The flag expects an extracted-snapshot layout (`<root>/<dataset>/snapshot.json`), not the version cache. The first offline build attempt failed immediately (L2032) and left a partial state file and an orphaned run dir to clean up.

## Symptom
- ev2 L278 USER: "i think that bucket name is stale for the snapshots".
- ev2 L285: `.env-snapshots -> /Users/christruter/workspace/metabase/.evals-worktree-shared/.env-snapshots`, `.env-warehouses -> ...` (symlinks, dated Aug 3).
- ev2 L294: `op read` -> `metabase-evals-dumps`. L300: local file holds a different value (redacted).
- 4ba L1954: `MISSING 2026-08-26-pg-copy-4814ce80ac / MISSING 2026-08-06-ch-native-e804e81711` in `.evals-worktree-shared/.snapshots`. L1972: `CACHED` for both under `~/Library/Caches/Metabase/snapshots/local`.
- 4ba L2032: `cannot read local warehouse manifest /Users/christruter/Library/Caches/Metabase/snapshots/local/analytics_warehouse/snapshot.json: [Errno 2] No such file or directory`.
- 4ba L1917: `resolve_env(Path('.env-warehouses'))` reported every key MISSING. The agent had passed the wrong file, and it took two more calls to learn which dotenv files the build actually reads (L1924-1931: "mise's `[env]` doesn't load `.env`").

## Timeline
- ev2 L266-275: outline written with the bucket name from `.env-warehouses`.
- ev2 L283-320: agent checks symlink dates and `op read`, fixes the outline, and advises "worth a re-`op inject` before your next `snapshot`/`appdb` run, since a publish against the old name would fail or land in the wrong place."
- 4ba L1945-1946: AWS SSO token expired, so the agent looks for an offline path.
- 4ba L1950-1977: finds the real cache location via `snapshots/home.py`.
- 4ba L2031-2049: `--warehouse-root` fails. Instead the agent seeds `warehouse_versions` into a build-state JSON by hand so `_warehouse_versions` skips `destination.latest_version()` (S3).

## Root cause
- Resolved secret files are copied once and symlinked into every worktree. There is no timestamp check or `op`-diff, and the templates (`.env-warehouses.tpl`) last changed in 5d06fca.
- `.evals-worktree-shared/.snapshots` is an older cache layout that is still on disk and is the natural place to look. `local_root()` resolves to the platform cache dir unless `SNAPSHOT_HOME` is set.
- `--warehouse-root` and the version cache use different directory shapes with no error hint pointing to the other.

## Why agents fall for it
- `.env*` files in the worktree look authoritative, and the agent is told not to print secrets, so it doesn't compare them with 1Password.
- A directory called `.snapshots` next to `.appdb` is the obvious cache.
- `--warehouse-root` sounds like "where the warehouse snapshots are".

## Current state
- Current check (2026-09-23): neither `.evals-worktree-shared/.env-warehouses` nor `.env-snapshots` contains `SNAPSHOT_S3_BUCKET=metabase-evals-dumps` (grep count 0; values not printed). So the files are probably still stale, or the key has moved.
- `.evals-worktree-shared/.snapshots/` still exists alongside the real cache.
- evals `stats/build.py:1807` still defines `--warehouse-root`.
- Memory `reference_evals_local_canonical_lane.md` and `project_evals_snapshot_bucket_configurable.md` mention bucket configurability. None warns that the resolved dotfiles go stale.

## Suggested fix
- Add a `mise run env:check` (or run it at build start) that diffs resolved dotfiles against `op` item versions, or stamps the resolve date and warns after N days.
- Delete or rename the legacy `.evals-worktree-shared/.snapshots`, or make `local_root()` print its path in build logs.
- When `--warehouse-root` is pointed at a version cache (detect `current.json` + `versions/`), fail with "this is a version cache; omit --warehouse-root and pre-seed versions / set SNAPSHOT_HOME".
- Document the offline-build recipe (seed `warehouse_versions` in state) in `docs/appdb.md`.

## Detection signal
- The agent reads a bucket, host or credential from a `.env*` file and the user replies "stale" / "wrong bucket".
- `ls -la .env*` showing symlinks into `.evals-worktree-shared` with old mtimes.
- A build aborting with `cannot read local warehouse manifest .../snapshots/local/<dataset>/snapshot.json`.

## Raw excerpts
```
ev2 L320 **Source:** `~/workspace/metabase/evals/.env-warehouses`, which is a symlink into `.evals-worktree-shared/`. It held <REDACTED>. That's a resolved `op inject` output from **Aug 3** (the `.env-snapshots` copy from Aug 26 has the same stale value), not a committed file — so it captured whatever 1Password said then.
**Live value:** `op read "op://Shared/evals-warehouse-snapshots/s3-bucket"` returns **`metabase-evals-dumps`**.
```
```
4ba L2067 One thing to flag rather than bury: my first attempt used `--warehouse-root`, which failed immediately — that flag wants an extracted-snapshot layout, not the version cache. I removed the partial state and orphaned run dir before retrying.
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/40577984-dcbb-4011-adcc-83edaa79924d.jsonl
  lines: 220-244 (outside the flagged range, same session) and 1003-1098 (flagged)
  date: 2026-08-26
  jev: {self_inflicted_bug: 0.84, tool_misuse: 0.38, misleading_signal: 0.46, user_correction: 0.97, codebase_trap: 0.88, flailing: 0.49, env_friction: 0.90}

Another way the same symlinks hurt: **the shared dirs look empty, or look local, when they are not.**
- L220-223 `du -sh .snapshots` → `0B .snapshots`; `find .snapshots -maxdepth 2 -mindepth 1 | wc -l` → `0`. L226 agent: "`.snapshots` is completely empty — 0 bytes, no entries at all ... then remove it."
- L227-228 only a follow-up `ls -ld` showed `.snapshots -> /Users/christruter/workspace/metabase/.evals-worktree-shared/.snapshots`. L244: "`find` doesn't follow symlinks by default and `du` sized the link itself. The target holds 28 entries of real snapshot data ... and **five worktrees** symlink to it. Deleting it would have destroyed shared data." A `snapshot publish` legacy-root guard (`snapshots/__main__.py:49 LEGACY_ROOT`) had prompted the deletion idea.
- L1003-1098 the "GC" in `.appdb/` (also a symlink into `.evals-worktree-shared/.appdb`) removed ~50 GB from the shared dir with `rm -rf "$S/..."`, where `S` was the shared target path. That was the right target, but it means a GC run from one worktree removes state for every worktree. The agent said so only in passing ("the `.appdb` is shared across all five worktrees, so this frees space once for everything"). There was no check that another worktree was not mid-build (an interrupted build deliberately keeps its `pgdata-*`/`warehouse-data-*` for `--from`).

Current state: the evals memory now documents the `find`/`du` trap (`evals-appdb-publish-runbook-traps.md` item 1: "`find` does not follow symlinks and `du` sizes the link, so it looks empty when it is not") and the symlink set (`evals-worktree-env-setup.md`). The note was written after this session. Nothing in the evals repo marks these paths as shared: the symlinks are gitignored, and `ls -la` in `/Users/christruter/workspace/metabase/evals` shows `.appdb .env .env-snapshots .env-warehouses .env.local-metabase .golden .snapshots .stats-encryption-secret-key -> .evals-worktree-shared/...`.

Detection: `du`/`find` without `-L`/`-H` on a path that is a symlink (`[ -L path ]`), followed by an `rm -rf` plan. Any `rm -rf` under `.evals-worktree-shared`.
