# Query pairs — slow → fast

Each `qNN_*.sql` file contains:

```
-- @meta
-- name:        <human title>
-- kind:        rewrite | index | rewrite+index | precompute
-- expected_speedup: <order-of-magnitude target>
-- requires:    <indexes / extensions / new transforms the fast version depends on>
--
-- @slow
<the un-optimized query>
--
-- @fast
<the optimized query (or sequence of CREATE TABLE statements, for precompute)>
```

A simple loader can split on the `-- @` markers and feed each side to the
verifier (Phase 4) or render `@slow → @fast` as a prelude example for the
LLM (Phase 2).

## Index

| #   | Pattern                                | Kind            | Target speedup |
|-----|----------------------------------------|-----------------|----------------|
| q01 | `NOT IN` → `NOT EXISTS` antijoin       | rewrite         | ≥100×          |
| q02 | Correlated subqueries → group + join   | rewrite         | ≥100×          |
| q03 | OR over multiple columns → `UNION ALL` | rewrite (+idx)  | ≥50×           |
| q04 | Full scan filter → status/date index   | index           | ≥100×          |
| q05 | `ILIKE '%…%'` → `pg_trgm` GIN          | rewrite+index   | ≥100×          |
| q06 | Top-N per group via window → lateral   | rewrite+index   | ≥50×           |
| q07 | Monolithic cohort retention → DAG      | precompute      | ≥10× per run, much more on re-run |
| q08 | Daily uniques over events → rollup DAG | precompute      | ≥100× on re-run |

## Conventions

- All queries reference the `shop` schema from `dataset/01_schema.sql`.
- `@slow` should be timed against the base schema (no extra indexes).
- `@fast` may reference indexes from `dataset/03_optimized_indexes.sql`.
- `precompute` pairs may include multiple `CREATE TABLE …_precomputed AS …`
  statements in the `@fast` block. The final `SELECT` queries those rollups.
