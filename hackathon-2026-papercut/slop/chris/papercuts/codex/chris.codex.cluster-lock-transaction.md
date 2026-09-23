# Cluster lock made a transaction guard misleading across backends

Source: Claude Code session `025e8586-a280-4a50-ae6c-ed98e5b728af`, [transcript](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/025e8586-a280-4a50-ae6c-ed98e5b728af.jsonl). Jev screening probability: 0.87, followed by source review.

Near miss: a proposed `in-transaction?` guard around `delete-obsolete-tables!` would have skipped search-index cleanup in production, because `cluster-lock/with-cluster-lock` wraps the reindex body in a transaction on Postgres and MySQL. On H2, the lock is in-process and does not create that transaction, so tests would have stayed green. The suspect commit was force-pushed away before merge; master retained the leak fix. The transcript verifies that distinction and the discarded commit's status ([lines 259–351](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/025e8586-a280-4a50-ae6c-ed98e5b728af.jsonl#L259)). This is a near miss, not a shipped regression.

The same session then investigated a test-side cleanup issue. The agent initially concluded that H2 did not reproduce the reported implicit-commit/savepoint failure. That conclusion was based on tests actually running against Postgres: `.lein-env` selected the app DB, while a `drivers: #{:h2}` banner referred to the warehouse driver. After correcting the environment, the H2 control reproduced the savepoint failure exactly ([lines 820–857 and 1018](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/025e8586-a280-4a50-ae6c-ed98e5b728af.jsonl#L820)).

Mechanism: an implicit transaction from the cluster lock, a backend-specific DDL behavior, and a misleading test banner each hid the effective conditions. An agent reasoning only from the local test result would choose the wrong guard or dismiss a real failure.

Classification: confirmed environment/contract papercut with a rejected near-miss fix and a concrete agent diagnosis reversal.
