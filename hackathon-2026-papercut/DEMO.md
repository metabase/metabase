# Demo runbook

The whole loop on one laptop: an agent session produces papercuts, the server groups
them, the web view shows them, and the dispatcher picks one to fix.
Checked end to end on 2026-09-23 against a fresh database.

Run everything from `hackathon-2026-papercut/` unless a step says otherwise.

## Before the demo

1. Put `TYPESAFE_API_KEY` in your shell. The mage scanner finds it in `.env`, but the
   dispatcher reads only the environment:

   ```sh
   export TYPESAFE_API_KEY="$(sed -n 's/^TYPESAFE_API_KEY=//p' ../.env)"
   ```

2. Start a server on a fresh database and load the archive. The import takes about a
   minute and gives 137 papercuts from about 290 reports.

   ```sh
   python3 server.py --db demo.sqlite3 --port 8770 &
   python3 seed_demo.py --server http://127.0.0.1:8770
   python3 import_local.py --server http://127.0.0.1:8770 slop/chris/papercuts/claude slop/chris/papercuts/codex
   ```

3. Record assessments, so the dispatcher has ready papercuts to choose from. This
   takes a few minutes of Jev calls. Expect about 8 `ready` and 18 `needs_human`.

   ```sh
   python3 dispatcher.py assess --server http://127.0.0.1:8770 --full
   ```

Against the shared server, use its URL instead and export `PAPERCUTS_TOKEN`. The
importer, scanner and dispatcher all send it.

## The demo

1. **What agents trip on.** Open <http://127.0.0.1:8770/?sort=reports>. The top
   papercut, zsh quirks in the Bash tool, has 36 reports. Open it to show its reports,
   history and related papercuts.
2. **A session reports papercuts.** From the repository root:

   ```sh
   ./bin/mage papercuts-scan-claude --dry-run --server http://127.0.0.1:8770 --session 31b066ea
   ```

   Jev screens the session, and Claude drills into the flagged part. Two of the three
   findings match papercuts the server already knows (`local-papercuts:...`), so they
   would join those papercuts instead of creating new ones. Drop `--dry-run` to submit.
3. **What is ready to fix.** Show the ready list:

   ```sh
   python3 dispatcher.py assess --server http://127.0.0.1:8770 --dry-run --id 101
   ```

   #101 (search-index DDL commits the test's rollback-only transaction) is a good
   example: repository code, high severity, reported several times.
4. **Fix it.** Without `--live`, this only prints the plan and writes the fixer's
   brief to `runs/dry-run-101.md`:

   ```sh
   python3 dispatcher.py dispatch --server http://127.0.0.1:8770 --id 101
   ```

   With `--live`, it creates the Linear issue, runs the fixer in its own worktree and
   opens a draft PR. That needs `LINEAR_API_KEY` and takes several minutes, so start
   it before the demo and show the result.

## Known rough edges

- **Owner guesses.** #94 (review-driven fix loops) came out `ready` although it is an
  agent habit, not repository code. Don't pick it for the live fix.
- **Papercut ids** depend on import order. Look ids up by title if the database was
  built differently.
