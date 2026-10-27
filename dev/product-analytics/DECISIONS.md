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
| ~~D3–D5~~ | ~~Select stages, PA endpoints, native perms, ClickHouse only~~ | Paid: `dan/pa-mbql` has none of them (D21) |
| D8  | Legacy conversion expands named stages into a tree   | Only execution still needs it (D18)                     |
| D9  | Drivers without CTEs refuse named stages             | Subselect expansion in the compiler, or accept refusal  |
| D11 | Dialect functions: no parametric calls, lambdas, windows | Grow the clause when a real analysis needs it        |
| D13 | Week start and timezone come from settings, not the query | Query-level options (projects D and week start)    |
| D14 | Editing helpers (`remove-replace`, next stage) assume a line | Teach them `source-stage` when the FE edits named stages |
| D15 | `auto-bucket-datetimes` re-buckets a dialect breakout | Skip clauses with an explicit `:base-type`              |
| D16 | Saved PA cards store compiled SQL                    | Save the MBQL query (project A, saved queries)          |
| D18 | Drivers run the legacy form; new clauses need legacy schema | Drivers take MBQL 5 at execution                |
| D22 | MBQL planners: no drills, chart order, or app wiring yet | Port drills; switch `use-analysis-query` to MBQL   |
| D23 | Cohort offsets come from periods that have events    | A date-axis source, if an empty period ever matters     |

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

- **keep**.
- `check-query-permissions*` no longer converts to legacy. `source-ids*` reads legacy and MBQL 5 as they are: the
  four keys mean the same in both, and preprocessing marks each MBQL 5 stage that came from a Card or a sandbox.
  `mbql5-required-perms` no longer round-trips through legacy.
- Why: the legacy conversion validated every clause, so `:dialect-fn` failed the permission check, though
  functions don't bear on permissions. It also expanded named stages into a tree, which dropped unread stages (D8).
- Evidence:
  - The walk matches legacy on 132 cards, 83 of which read other cards.
  - Permission, sandboxing, block, audit and advanced-permissions suites: 331 tests. The 8 failures are identical on
    baseline code in the dev JVM, so none is attributable to this change.
  - A user with query-builder access to one table runs named stages plus a dialect function through
    `/api/dataset`. A join to another table is denied, and so is native SQL.
  - `mbql5-named-stages-query-test` fails closed on the old code.
- Found on the way: EE `check-audit-db-permissions` destructured legacy `:type`/`:query` and got nil on MBQL 5. It
  failed closed by accident. Every callee of the permission check has to be read for legacy shape assumptions.

## D18: Drivers still run the legacy form of a query

- **budget**.
- `qp.execute/run` converts the compiled query to legacy before the driver sees it (Cam's TODO there). So each new
  clause also needs a legacy schema entry: `:dialect-fn` and `:dialect-aggregation` have one, as pass-through clauses.
  `expand-named-stages` strips `:name` even from a plain chain.
- The driver only reads `:native`, `:database` and `:info` at that point, so this is shape, not semantics.
- Found by the port: the legacy form only accepts a new clause as a whole expression. `actors / sum(actors) OVER ()`
  fails in the legacy round trip, because legacy arithmetic arguments don't know `:window`. Planners name the window
  as its own expression and divide by a reference to it, which compiles to the same SQL.
- Pays back: drivers take MBQL 5 at execution, and the conversion goes.

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

## D19: A stage can append other stages' rows with `:union-all`

- **keep**, shape; **budget**, the legacy round trip.
- Shape: `{:source-stage "active" :union-all ["dormant" …]}` on an ordinary MBQL stage. Its source is the
  `:source-stage` rows with each listed stage's rows appended, matched by column position. Its own filters, fields,
  breakouts, aggregations and order-by apply on top. Columns and types come from the source stage.
- `:union-all` requires an explicit `:source-stage`; the implicit previous stage is not a first branch. A union names
  every branch it reads, and the schema checks every name points backwards, as `:source-stage` does.
- Lib: `lib.util/stage-reads` lists every name a stage reads (source, branches, joins), and the schema, legacy
  expansion and compiler use it. `union-all-stage-numbers` gives the branches. `returned-columns` of the union stage
  throws when a branch returns a different number of columns than the source stage.
- Compile: `FROM (SELECT a AS a, b AS b FROM __mb_stage_1 UNION ALL SELECT c AS a, d AS b FROM __mb_stage_2) AS
  __mb_source`. Each branch projects the names its own compiled `SELECT` produced, renamed to the first branch's names,
  so escaping and order are what the CTE really returns. A branch without a `SELECT` (native) is refused.
- Gate: driver feature `:union-all-stages`, true for `:sql`; drivers that nest stages as subselects still refuse
  named reads (D9).
- Why: PA funnels and retention append cohorts (`active` + `dormant`). A key on a stage keeps the stage's own clauses
  and metadata; nothing new has to learn a second kind of source.
- Rejected:
  - A `:mbql.stage/union` stage kind. Every walker, `returned-columns` and the CTE compiler would need a new branch, for
    a stage that can be written as "source plus appended rows".
  - Implicit previous stage as the first branch. Appending is the one place a hidden source reads ambiguously.
  - `SELECT *` per branch. Positional matching then depends on each CTE's column order, which the compiler, not the
    query, decides.
- Budget: legacy MBQL (D18) holds `:union-all` as a vector of source-query trees, so the form drivers get is honest.
  Converting it back to MBQL 5 (the driver's `lib/query` for the row limit) drops the branches: the tree has no names
  to rebuild them with. Pays back with D18.
- Evidence: event counts by name over `pageview` rows plus other rows with `session_id` standing in for `person_id`
  match hand-written `UNION ALL` SQL on ClickHouse (DB 2) and Postgres (DB 81).

## D20: A `:window` expression states its own window

- **keep**, shape; **budget**, the items below.
- Shape:
  `[:window {:frame {:mode :rows :start <bound> :end <bound>}} <fn> [:partition-by {} & exprs] [:order-by {} & [:asc|:desc {} expr]]]`.
  `<bound>` is `:unbounded-preceding`, `:current-row`, `:unbounded-following`, `[:preceding n]` or `[:following n]`.
  `<fn>` is `[:row-number {}]`, `[:lag {} expr n default?]`, `[:lead {} expr n default?]`, or the aggregation clauses
  `:min`, `:max`, `:sum`, `:count`. `:frame` is optional; partition and order may be empty (`sum(x) OVER ()`).
  Order and partition items are any expressions, e.g. a `:case` for `multiIf`.
- Where: in `:expressions` of a stage with no aggregation or breakout. The stage's filters apply before the window, as
  in SQL. A filter on a window, directly or through its expression name, is refused; it goes in the next stage.
  `:row-number`, `:lag` and `:lead` are refused anywhere except as a window's function.
- Types: `row-number` and `count` are Integer; `lag`, `lead`, `min`, `max` take their argument's type; `sum` follows
  the aggregation rule.
- Compile: `->honeysql [:sql :window]` emits `fn OVER (PARTITION BY … ORDER BY … ROWS BETWEEN … AND …)`; the frame is
  a registered HoneySQL clause (`::window-frame`) next to `::rows-unbounded-preceding`. The frame is emitted as written,
  so the funnel's growing `ORDER BY rn DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING` stays that way.
  ClickHouse writes `lag`/`lead` as `lagInFrame`/`leadInFrame`, wraps the argument in `toNullable` when there is no
  default (NULL past the frame, as elsewhere), and uses the whole partition as the frame unless the query states one.
- `nest-expressions` only splits a window stage when its order-by uses an expression. Filters and windows stay in the
  inner stage and the order-by moves out, so filters still apply first.
- Gate: driver feature `:window-functions/general`, true for `:sql` and stated for ClickHouse.
- Changes from the starting design: none to the shape. Added the stage rules above (the design allowed a filter on a
  window, which SQL rejects) and `:mode` is `:rows` only.
- Why: funnels, paths and retention need per-actor ordering (`row_number`, `lead`, running sums, earliest later step).
  The existing `:offset`, `:cum-sum` and `:cum-count` take their window from the stage's breakouts, so they can't say
  "partition by actor".
- Rejected:
  - Growing `:offset` with partition options: it is an aggregation, tied to breakouts.
  - The window in a stage key (`:window {:partition-by …}` shared by several expressions): every PA window that shares
    a partition still differs in order or frame.
  - Frame bounds as clauses (`[:preceding {} 1]`): they hold no expressions, so they belong in options with the other
    modifiers.
  - Windows over aggregations in one stage: aggregate in one stage and window in the next.
- Budget:
  - `:mode :range` and `GROUPS` frames are not supported.
  - The stage rule walks every stage on validation.
  - Legacy MBQL (D18) passes `:window` through unchecked, as `:dialect-fn` does.
  - MySQL inherits `:window-functions/general` from `:sql`, though it opts out of `:window-functions/offset`. That
    opt-out is about `GROUP BY`, which a window stage can't have; untested.
  - The driver changelog in `docs/developers-guide` doesn't list the two new features.
- Evidence: a 1,929-row per-person query (`row_number` ordered by a `:case`, the funnel's `MIN(CASE …)` over
  `ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING`, `lead`, `lag` with a default, a running `SUM`, a partition-only
  `MIN`, `COUNT(*) OVER ()`) matches hand-written SQL row for row on ClickHouse (DB 2, with
  `leadInFrame … ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING`) and Postgres (DB 81). Shares
  (`SUM(count) OVER ()` in the stage after a count) match on both.

## D21: Rebuild on upstream, port the string planners straight to MBQL

- **keep**. Branch `dan/pa-mbql` is `origin/product-analytics` (Kevin's funnel run query, `6907c3681f6`) plus the
  MBQL commits cherry-picked from `dan/pa-structured-queries`.
- The intermediate PA format (select stages, `/api/product-analytics`, its compiler) is left behind on the old branch.
  The frontend builds MBQL 5 JSON (`frontend/src/metabase/product-analytics/mbql/`), with named stages, and runs it as
  an ordinary query.
- Why: upstream changed every SQL planner (funnel rewrite, breakout first touchpoint, disqualifiers). Rebasing the
  select-stage port would mean porting those changes into a format we were retiring.
- Oracle: `dev/product-analytics/mbql-variants.ts` writes each variant's SQL (the string planners, unchanged) and MBQL
  query; `dev.product-analytics-mbql-diff/diff` runs both through the QP and compares rows. The string planners stay
  the reference until each analysis is ported.
- Rejected: a backend planner (Clojure) building MBQL from the spec. The frontend already owns the spec and the base
  query from the query builder; the backend's job is to run MBQL, not to know analyses.
- Found by the port (fixed, `f94d7ad11aa`): `nest-expressions`/`nest-breakouts` split a stage without keeping its name
  and source, and implicit fields, implicit joins and remaps read the stage before instead of the stage named.
- Found by the oracle: the string planners' habit at session grain names its count `sessions`, which ClickHouse
  rejects. Not ours to fix; reported upstream.

## D22: MBQL planners are not wired into the app yet

- **budget**. Ported: habit (all measures), cohorts, lifecycle, each with breakouts. Not yet: funnel, paths.
- Not ported in any analysis: drill-through members, breakout chart ordering (the oracle compares rows as bags), and
  `use-analysis-query` still runs the string planners' SQL.
- Pays back: port the rest, then drills, then switch the app.

## D23: Cohort offsets come from the periods that have events

- **budget**. The string planner counts offsets with `ARRAY JOIN range(observable + 1)`. MBQL has no row generator,
  so the MBQL planner joins each start to the periods with any event in scope, on `period >= start`.
- A period with no event at all drops out of the triangle. That can't happen on real event volumes, and every cohort
  variant matches.
- Pays back: a calendar or numbers source in MBQL, if it ever matters.
