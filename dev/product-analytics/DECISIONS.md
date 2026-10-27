# Product analytics: decision log

Consequential decisions on `dan/pa-structured-queries`, newest last. Each one records what we chose, why, what we
rejected, and whether it is spent budget.

Status:

- **keep**: what we'd ship.
- **budget**: a simplification that keeps the POC moving. It must be paid back before production, and "Pays back"
  says how.
- **open**: not decided yet.

## Budget at a glance

| #   | Simplification                                       | Pays back                                               |
|-----|------------------------------------------------------|---------------------------------------------------------|
| D3  | Select stages compile outside the QP                 | Retire select stages; every PA analysis is MBQL         |
| D4  | PA endpoints demand native permissions               | Falls out of D3                                         |
| D5  | PA endpoints accept ClickHouse only                  | Falls out of D3 + per-driver dialect lists              |
| D8  | Legacy conversion expands named stages into a tree   | Permissions on MBQL 5 (D12); then nothing needs it      |
| D9  | Drivers without CTEs refuse named stages             | Subselect expansion in the compiler, or accept refusal  |
| D11 | Dialect functions: no parametric calls, lambdas, windows | Grow the clause when a real analysis needs it        |
| D13 | Week start and timezone come from settings, not the query | Query-level options (projects D and week start)    |
| D14 | Editing helpers (`remove-replace`, next stage) assume a line | Teach them `source-stage` when the FE edits named stages |
| D15 | `auto-bucket-datetimes` re-buckets a dialect breakout | Skip clauses with an explicit `:base-type`              |
| D16 | Saved PA cards store compiled SQL                    | Save the MBQL query (project A, saved queries)          |

## D1: Compile structured queries on the backend

- **keep**, a5ed2daf02b.
- The frontend sends `{type: "product-analytics", database, stages[]}`, and the backend compiles it. Previously the
  frontend planners built SQL strings.
- Why: one place to validate, check permissions, and port to a second database.
- Rejected: keeping FE string building and adding guards to it. Every guard would be a SQL parser.
- Oracle: `diff.ts`, 56/56 variants match the old planners.

## D2: Converge on MBQL rather than grow a parallel format

- **keep**, 7558b985426 onwards.
- PA needs DAG-shaped queries: a stage reads any earlier stage by name. We added that to MBQL 5 (`:name`,
  `:source-stage` on stages and joins) instead of keeping PA's own stage kinds.
- Why: MBQL already gets permissions, sandboxing, metadata, drills and saved cards. A parallel format has to
  re-earn each one. The MBQL review flagged select stages as a sandbox hazard.
- Rejected: PA select stages as the long-term format (D3).
- Shape: a stage reads `:source-stage` if present, else the previous stage. It is reified as
  `lib.util/source-stage-number`, and `previous-stage-number` is now an alias for it. A join reads either
  `:stages` or `:source-stage`, exactly one. The schema requires names to be unique and every read to point
  backwards.

## D3: Select stages compile outside the QP

- **budget**, a5ed2daf02b.
- `pa.stage/select` and `union-all` compile straight to SQL. Only `pa.stage/mbql` stages go through the QP.
- Cost: the permission walk can't see their table references. `x IN (events)` names a table as a bare identifier,
  so does `hasColumnInTable('system', 'tables')`.
- Pays back: express every PA analysis as MBQL named stages. The habit analysis already runs that way on both
  databases.

## D4: PA endpoints demand native query permissions

- **budget**, 8ac18f4cbdf.
- Fixes the security review's finding that an empty `*embedded-queries*` vector is truthy, so nothing was checked.
- Why: D3 queries can read any table the connection can. Native permission is the honest grant for that.
- Rejected: an allowlist of select-stage SQL. A clever solution that is fundamentally flawed isn't so clever.

## D5: PA endpoints accept ClickHouse databases only

- **budget**, 8ac18f4cbdf.
- Select stages emit ClickHouse SQL, and the security review found any engine was accepted.

## D6: Security invariants

- **keep**, adopted after the security review.
- These hold for every sketch, POC and prototype:
  1. One representation: permissions are checked on what runs.
  2. Every table read is an explicit reference the query processor sees.
  3. Allowlists fail closed.

## D7: Named stages compile to CTEs

- **keep**, 7558b985426. Builds on eff98fa17bb, the cherry-pick of Riley's CTE opt-in.
- `stages->honeysql-ctes` gives each stage a CTE and resolves `:source-stage` through `::stage-name->cte`.
- Why: a DAG compiles to CTEs naturally, and a stage read twice is written once.

## D8: Legacy conversion expands named stages into a tree

- **budget**, 7558b985426.
- `->legacy-MBQL` calls `expand-named-stages`: each join gets a copy of the stages it reads, and stages nothing
  reads are dropped.
- Why: permissions and some middleware still run on legacy MBQL, which is a tree.
- Cost: the expanded tree and the compiled SQL disagree. The CTE compiler emits unread stages, and the tree drops
  them, so the permission walk doesn't see them. The security review rated this MEDIUM.
- Pays back: D12 removes the reason to expand at all. Until then, a schema rule that every stage except the last
  is read by some later stage keeps the two in agreement.

## D9: Drivers without CTEs refuse named stages

- **budget**, 7558b985426.
- On those drivers, `reads-named-stage?` throws `unsupported-feature`.
- Rejected: silently inlining stages as subselects. That would duplicate work, and nobody asked for it yet.

## D10: Dialect functions are an MBQL clause with a driver allowlist

- **keep**, 435c2f17447.
- Shape: `[:dialect-fn {:base-type …} "name" & args]` and `:dialect-aggregation`.
- Lib types the clause from `:base-type`. `sql.qp/dialect-functions` maps each name to `:scalar` or `:aggregate`,
  and the default is `{}`, so it fails closed. The name must match `^[A-Za-z_][A-Za-z0-9_]*$` and is emitted as a
  quoted identifier.
- Why: an escape hatch that still sits inside MBQL. Columns, types and permissions stay intact, and there is no
  raw SQL.
- Rejected: forking a clause per database; a raw SQL fragment clause, which reopens D6.2.
- Rule: the allowlist excludes functions that take table names, such as `hasColumnInTable` and `joinGet`. That is
  where functions meet permissions.

## D11: Dialect functions cover plain calls only

- **budget**, 435c2f17447.
- No parametric calls (`quantile(0.5)(x)`), lambdas, or window functions. `range` is excluded.

## D12: Permissions walk MBQL 5 directly

- **open**.
- Today `check-query-permissions*` and `source-ids*` convert to legacy first. Legacy conversion validates every
  clause, so a query using `:dialect-fn` fails its permission check, though functions don't bear on permissions.
- Evidence: the same four-key walk over MBQL 5 matches legacy on 132 cards (83 reading other cards), native SQL
  and named stages, and handles `:dialect-fn`. No sandboxed queries were in that corpus.
- Proposal: walk MBQL 5, converting legacy input to MBQL 5 on the way in. That also retires D8.
- Blocks: deciding the legacy MBQL direction. We deferred that, but this would settle it for permissions.

## D13: Week start and timezone come from settings

- **budget**, found on the Postgres port.
- The habit analysis matches only with `start-of-week :monday` bound. The query cannot say which week it means.

## D14: Editing helpers assume stages form a line

- **budget**.
- `remove-replace` and next-stage editing are still linear. Reading a stage by name works, editing one doesn't
  yet.

## D15: `auto-bucket-datetimes` re-buckets a dialect breakout

- **budget**.
- A DateTime `:dialect-fn` breakout gets a default temporal unit.

## D16: Saved PA cards store compiled SQL

- **budget**.
- Reusing saved queries (`:source-card`) already works through `pa.stage/mbql`. Saving PA analyses as MBQL is
  project A.

## D17: Postgres is the second warehouse

- **keep**, as a test bed, not a target.
- Local columnar options are thin; BigQuery, Redshift and Snowflake are cloud only. Postgres runs locally in
  `pg-product-analytics`, and Map columns load as jsonb.
- Why: a second dialect shows what is ClickHouse-specific. So far that is week start, timezone and map access.
