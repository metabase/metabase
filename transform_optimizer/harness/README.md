# Validation harness

Loads the dataset and validates every `queries/qNN_*.sql` pair by:

1. **Resetting** the database (optional; one-shot with `--reset`).
2. **Loading** `dataset/01_schema.sql` and `dataset/02_seed.sql`.
3. **Running every `@slow` query** against the baseline schema (no helper
   indexes). Each result is materialized into `bench.slow_qNN` so we can
   compare it later.
4. **Applying** `dataset/03_optimized_indexes.sql` (idempotent).
5. **Running every `@fast` query** against the now-indexed schema. The
   *last* statement in `@fast` is treated as the comparison query;
   preceding statements (precompute `CREATE TABLE …`, etc.) run as
   setup. Result materialized into `bench.fast_qNN`.
6. **Comparing** `bench.slow_qNN` vs `bench.fast_qNN` using the same
   `EXCEPT ALL`-in-both-directions form the verifier (Phase 4 in
   `PLAN.md`) will use.

Volatile `NOW()` calls in the `.sql` files are textually replaced with a
single `TIMESTAMPTZ` captured at the start of the run, so the slow and
fast queries see the same 90-day window even though they execute minutes
apart.

## Prerequisites

- A reachable Postgres instance the user can `CREATE SCHEMA` on.
- `clojure` CLI (the script uses `-Sdeps` to pull `next.jdbc` and the
  Postgres driver — nothing needs to be pre-installed beyond the CLI).

The default connection is `postgres@localhost:5432/transform_optimizer`.
Create the database first:

```bash
createdb transform_optimizer
```

## First run (load + validate)

```bash
./run.sh --reset
```

The first run is dominated by the seed (`02_seed.sql` — ~30M events
plus 15M order_items). On a developer laptop expect several minutes.

## Subsequent runs

Once the database is populated, skip `--reset` to re-run just the
slow/fast validation against the existing data:

```bash
./run.sh
./run.sh --only q01,q04             # subset
TO_DB_HOST=db.example ./run.sh      # env-var connection
```

## Output

```
=== Transform Optimizer Validation Harness ===
Database: postgres://postgres@localhost:5432/transform_optimizer  (--reset)

== Phase 1: reset + load schema + seed ==
  01_schema.sql                  (0.4s)
  02_seed.sql                    (312.7s)

Reference instant for NOW(): 2026-05-12T10:55:14Z

== Phase 2: run slow queries (baseline schema, no helper indexes) ==
  q01_not_in_antijoin              slow   18.314s  rows=47312
  q02_correlated_subquery          slow   24.140s  rows=39998
  ...

== Phase 3: apply optimized indexes ==
  03_optimized_indexes.sql        (71.2s)

== Phase 4: run fast queries (with indexes) ==
  q01_not_in_antijoin              fast    0.094s  rows=47312
  ...

== Phase 5: compare results (EXCEPT ALL, both directions) ==
  q01_not_in_antijoin            [rewrite        ] slow   18.314s  fast    0.094s  × 194.8  ✓ eq
  q02_correlated_subquery        [rewrite        ] slow   24.140s  fast    0.211s  × 114.4  ✓ eq
  ...

Summary: 8/8 equivalent, geomean speedup ×152.3
```

Exit code is `0` when every pair is equivalent, `1` otherwise — usable
from CI.

## Caveats

- Wall-clock timings include the `CREATE TABLE … AS …` write overhead.
  This is constant per row-count, so the slow/fast ratio is preserved,
  but the absolute slow numbers are slightly inflated vs a plain
  `SELECT`. Acceptable for "is this 100× faster?" — not for benchmark
  papers.
- `bench.slow_qNN` and `bench.fast_qNN` are left behind for inspection
  after a run; `--reset` clears them.
- Precompute pairs (q07, q08) create persistent tables in the `shop`
  schema (e.g. `shop.customer_first_purchase`). The pair's own
  `DROP TABLE IF EXISTS …` keeps re-runs idempotent.
- Equivalence is **set-with-multiplicity** (`EXCEPT ALL`). Two rewrites
  that produce the same rows in a different order are still equivalent;
  rewrites that drop or duplicate a row are not.
