# Sample-DB in-place swap test (v62 H2 -> v63 branch SQLite)

Seeds content on **v62** (H2 sample DB), then switches to the **v63 branch jar**, whose startup migrates
the sample DB from H2 to SQLite **in place** (flips engine + table schema, resyncs, keeps all ids). Then
it's left running for you to poke at.

Both jars share one H2 file app-db + one plugins dir under `.work/`, and run one at a time.

## Prereqs
- `java`, `curl`, `jq`
- The two jars (defaults in `config.sh`):
  - `jars/metabase_1.62.2.jar`
  - `jars/metabase_branch_GHY-4069-minimal-migration-approach_...jar`

## Run
```bash
cd sample-db-swap-test
./10-seed-v62.sh     # fresh v62: H2 sample DB + an MBQL (date-bucketed) card + a native (H2 DATE_TRUNC) card
./20-switch-v63.sh   # start v63 branch jar (in-place swap to SQLite), re-runs the cards, LEAVES IT RUNNING
# ... investigate manually in the browser (URLs + creds printed) ...
./stop.sh            # stop; add --clean to wipe .work for a fresh run
```

## What to look at
- Sample DB engine should be **sqlite** after the switch, same DB id.
- **MBQL card**: should still run (the QP recompiles MBQL per-driver).
- **Native card**: uses an H2 `DATE_TRUNC` — likely **fails** on SQLite (native SQL is engine-specific).
  That's the interesting case to eyeball: does anything auto-adapt, and how bad is the failure mode.
- Also worth checking in the UI: the Example collection dashboards/cards, table/field metadata
  (`database_type` may read H2 values until the next scheduled sync).

## Notes
- Logs: `.work/logs/v62.log`, `.work/logs/v63.log`. If a step hangs on "waiting for /api/health", check them.
- App-db + plugins + admin creds persist across both steps — that's what exercises the real upgrade path.
- Both jars are EE (v1.x); no token needed for the sample DB.
