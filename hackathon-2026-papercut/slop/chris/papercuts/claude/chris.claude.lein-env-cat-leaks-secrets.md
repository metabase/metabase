---
title: Agents `cat .lein-env` to learn which test app DB is in use; the file holds private keys and tokens, and ad-hoc `sed` redaction of "password" does not catch them
slug: lein-env-cat-leaks-secrets
kind: env-friction
impact: introduced-bug
severity: high
status: open
area: gitignored .lein-env / .env in the metabase main checkout; worktree bootstrap (copying .lein-env, .env, .clj-kondo lib configs)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-worktree-break-requiring-resolve-cycles/44d740f8-47f4-42f8-b6af-2964dbacf800.jsonl
    lines: 338-361 (cause), 710 (disclosure); flagged region 650-987
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.29, misleading_signal: 0.65, user_correction: 0.93, codebase_trap: 0.68, flailing: 0.36, env_friction: 0.83}
---
## Summary
The agent needed to know whether the test app DB was Postgres or H2 (see `local-test-appdb-differs-per-worktree-lein-env`). It ran:

```
ls -la .lein-env .env 2>/dev/null; cat .lein-env 2>/dev/null | sed -E 's/(password|pass)[^,}]*/\1 <redacted>/Ig'; env | grep -E '^MB_DB_(TYPE|HOST|PORT|DBNAME)'
```

`.lein-env` is 9.5 KB and holds much more than DB passwords: private keys, hosted tokens, encryption keys. The sed only masked `password`/`pass`, so the rest went into the session transcript. The agent disclosed it at the end of its summary (L710): "My earlier `.lein-env` check printed its full contents, including private keys and tokens, into this session's output. Nothing was sent anywhere else." It then copied `.lein-env` and `.env` into a throwaway control worktree (L354) so tests there would match. That makes more plaintext copies, which it removed later with the worktree (L698: "the master-control worktree with its credential copies is removed").

A related friction in the same session: fresh worktrees lack the gitignored `.clj-kondo` library configs, so the agent copied them in so linting would work (L710: "I copied kondo's library configs into this worktree's `.clj-kondo` (gitignored)").

## Symptom
- L338 command above. L725: `-rw-r--r--@ 1 christruter staff 9554 Sep 11 16:38 .lein-env`, then its contents (secrets mostly caught by render redaction, but in the raw jsonl).
- L353 THINKING: "I need to flag that my `.lein-env` check accidentally printed sensitive credentials into this session's transcript."
- L354: `cp .lein-env .env /Users/christruter/workspace/metabase/metabase.master-control-rrc/`.
- L710 disclosure to the user.

## Timeline
- L338: cat + sed.
- L353-354: agent realises, continues, copies the env files into a new worktree.
- L690/L698: removes the control worktree ("with its credential copies").
- L710: tells the user.

## Root cause
- The only way to learn the effective test DB config is to read `.lein-env` (plus env vars). No command prints just the resolved `MB_DB_*` values. The test banner names only the warehouse driver.
- `.lein-env` mixes DB selection with unrelated secrets, so any read of it is a secret read.
- New worktrees don't get `.lein-env` / `.env` / kondo lib configs automatically, so agents copy them by hand.

## Why agents fall for it
- `cat` + `sed` redaction feels safe, but pattern redaction written on the spot can't know the file's keys.
- The memory `reference_local_test_appdb_migration_reset.md` points to `.lein-env` as where the test app-DB config lives, which invites reading it.

## Current state
Unchanged: `.lein-env` is still the gitignored config source (memory: `reference_local_test_appdb_migration_reset.md`, `reference_local_test_appdb_is_hosted.md`). No helper prints only non-secret keys. The existing papercut `chris.claude.local-test-appdb-differs-per-worktree-lein-env.md` also shows agents running `cat .lein-env` (its L833-835 and L1160-1161), so the read pattern recurs across sessions.

## Suggested fix
- Add `./bin/mage test-db-info` (or a `bin/test-agent --print-db`) that prints the resolved `mb-db-type/host/port/dbname` and "encrypted: yes/no", with no values for secret keys.
- Add a memory/CLAUDE.md rule: "Never `cat .lein-env` or `.env`; read specific keys with `grep -E '^\s*:mb-db-(type|host|port|dbname)' .lein-env`."
- Add a PreToolUse hook that blocks `cat`/`less`/`head` on `.lein-env`, `.env`, `.env-*`.
- Add a worktree bootstrap (`wt` post-create hook) that symlinks `.lein-env`/`.env` and the kondo lib configs rather than having agents copy them.

## Detection signal
- Bash commands whose argv includes `cat` / `head` / `sed -n` on `.lein-env` or `.env*` without a key filter.
- Result text containing `BEGIN .*PRIVATE KEY` or long base64 runs after such a command.
- Assistant phrases: "printed its full contents", "credential copies".

## Raw excerpts
```
L338 [TOOL Bash] ls -la .lein-env .env 2>/dev/null; cat .lein-env 2>/dev/null | sed -E 's/(password|pass)[^,}]*/\1 <redacted>/Ig'; env | grep -E '^MB_DB_(TYPE|HOST|PORT|DBNAME)'
L353 [THINKING] ... but I need to flag that my `.lein-env` check accidentally printed sensitive credentials into this session's transcript.
L354 [TOOL Bash] cp .lein-env .env /Users/christruter/workspace/metabase/metabase.master-control-rrc/ && ls ...
L710 - My earlier `.lein-env` check printed its full contents, including private keys and tokens, into this session's output. Nothing was sent anywhere else.
- I copied kondo's library configs into this worktree's `.clj-kondo` (gitignored) so linting works here.
```
