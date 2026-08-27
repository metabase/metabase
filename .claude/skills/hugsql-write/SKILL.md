---
name: hugsql-write
description: Convert Metabase app-db queries from HoneySQL to HugSQL SQL-in-files, or write new ones. Use when moving a model's t2/select-with-a-map queries into a .sql file, adding a query to an existing HugSQL queries ns, or when a task mentions HugSQL, app-db SQL injection hardening, or the raw-splice ban. Not for warehouse/MBQL queries (those stay query-as-data).
---

# HugSQL for app-db queries

Move the risky slice of app-db queries — the ones that build `:where`/`:order-by`/`:join`
*structure* from request input — out of HoneySQL and into literal SQL files, so structure can
never be built from user input by accident. Reference implementation: the `task_history` module
(`src/metabase/task_history/models/task_history.sql` + `..._queries.clj`).

## When this applies

- **Convert to HugSQL**: a query whose SQL *shape* varies with request input (sort column, optional
  filters, dynamic joins). This is the injection-prone slice.
- **Leave on HoneySQL**: genuinely dynamic structure — runtime UNION arm counts, computed SELECT
  lists, per-user permission fragments (e.g. the legacy search compiler). Forcing these into `.sql`
  means rebuilding a query builder out of string splices.
- **Never**: warehouse / MBQL / QP queries. Those need query-as-data.

The tell for "convert it": the SQL differs by request input, but only in ways a fixed set of
static shapes can express (see the four patterns below).

## The architecture

Three layers. HugSQL only *builds* sqlvecs; `metabase.app-db.hugsql` runs them as a middleware
stack; the model definition stays the single declaration of transforms/hooks/perms.

```
task_history.sql            structure: private `-- :name-` builders, :value: params only
  |
task_history_queries.clj    executors: params-in / rows-out, via app-db.hugsql; builders private
  |
task_history.clj            model: deftransforms, hooks, perms, schemas, domain fns
  |
callers                     never touch a queryable
```

### 1. The `.sql` file

- One `-- :name- foo :? :*` block per query. **Trailing dash = private** — builders never leak.
- Params are `:value:x` / `:value*:xs` **only**. Long form, not `:v:`.
- Param naming: params mirroring a column use the column name (snake_case, so row maps flow in);
  synthetic inputs are kebab-case (`:sort-col`, `:run-id`).
- Portable ANSI SQL — must run unchanged on H2/MySQL/Postgres.

### 2. The queries ns

```clojure
(ns metabase.foo.models.foo-queries
  (:require [hugsql.core :as hugsql]
            [metabase.app-db.hugsql :as app-db.hugsql]))

(def ^:private model :model/Foo)

;; declare = table of contents; builders are named <name>-sqlvec (the default suffix) so they
;; never collide with the public executors below.
(declare list-foos-sqlvec insert-foo-sqlvec ...)
(hugsql/def-sqlvec-fns "metabase/foo/models/foo.sql")

;; public executors: params in, rows/instances or a count out
(def list-foos (app-db.hugsql/select-executor model list-foos-sqlvec))

(defn insert-foo! [row]
  (app-db.hugsql/insert-returning-pk! model insert-foo-sqlvec row))

(defn count-foos [params]
  (:cnt (app-db.hugsql/scalar model count-foos-sqlvec params)))
```

`metabase.app-db.hugsql` provides:
- `select-executor` — `params -> [instance]`; in-transforms params, executes, out-transforms rows
  and tags them as model instances (so `t2/hydrate` composes).
- `scalar` — `params -> map` for a single aggregate/value row (`COUNT(*)`, one column).
- `execute!` — `params -> count` for DML.
- `insert-returning-pk!` — insert one row, return the generated PK (cross-db).

The `:in`/`:out` transforms are **lifted from the model's `t2/deftransforms`** at call time — you
never write `status->wire`, and there's nothing to keep in sync. `deftransforms` stays exactly as
it was.

### 3. The model ns

Unchanged in shape: `t2/deftransforms`, `define-after-insert`/`define-before-update` (guard the
Toucan write path used by `with-temp`/tests), perms, schemas. Domain fns call the queries-ns
executors. Raw-SQL writes bypass the hooks, so call the hook's assertion fn directly at the write
site and leave a note on the hook.

## The four static-SQL patterns

Learn these before concluding a query "needs" dynamic SQL.

**Optional filter — null-guard:**
```sql
WHERE (:value:task IS NULL OR task = :value:task)
```

**Dynamic ORDER BY — CASE no-op sort keys.** Sort column and direction are *values*; one CASE line
activates per request, the rest are NULL (inert sort keys). Hostile input matches nothing and
falls through to the id tie-break:
```sql
ORDER BY
  CASE WHEN :value:sort-col = 'started_at' AND :value:sort-dir = 'asc'  THEN started_at END ASC,
  CASE WHEN :value:sort-col = 'started_at' AND :value:sort-dir = 'desc' THEN started_at END DESC,
  ...one pair per sortable column...
  id DESC
```

**Conditional join — make it unconditional** when the join target is at-most-one-row (FK → PK):
joining always doesn't change the row set.

**IN list** — `col IN (:value*:ids)`, and **guard empty in the executor** (`(seq ids)`), because
empty `:value*:` renders `IN ()`, a syntax error on all three backends.

Also: bind timestamps as `:value:` params (`(t/instant)`), never `CURRENT_TIMESTAMP` (second-
resolution on MySQL) and never `(mi/now)` (it's a HoneySQL form, serializes as an object).

## The raw-splice ban

`:sql:` / `:snip:` / `:sqlvec:` / `:i(dentifier):` splice unescaped or unquoted text — the
injection holes. They are:
- **disarmed at runtime** — `metabase.app-db.hugsql` overrides `apply-hugsql-param` to throw for
  those types; a banned param can't execute.
- **linted** — `./bin/mage lint-raw-splices` (fast) and a CI deftest scan every `.sql` under `src/`
  and `enterprise/backend/src` against `mage/resources/raw-splice-allowlist.edn` (empty).

To open the hatch (rarely justified): delete the type from `disarmed-param-types` (a loud global
diff), add an allowlist entry, feed it only from a closed literal set by keyed lookup, defend it in
the PR. If a query *wants* a splice, it has dynamic structure — it belongs on HoneySQL.

## Every conversion ships two tests

1. **Golden equivalence** — keep the old HoneySQL impls verbatim in the test ns, assert identical
   results across the full sort × direction × filter × paging matrix (scope comparisons to temp
   rows so parallel writers don't race). Label it SCAFFOLDING; delete a release after ship. CI's
   app-db matrix runs it per dialect — that's the H2/MySQL/Postgres check.
2. **Hostile-input** — a malicious sort/filter value appears in the params vector, never in the SQL
   string.

## Dialect divergence

Portable ANSI first. If one query genuinely diverges: two `-- :name-`s + `case` on `(mdb/db-type)`.
If several: `models/<dialect>/foo.sql` overrides (h2/mysql/postgres) carrying only the diverging
names, loaded after the base. Don't build a dialect layer; the golden matrix is the referee.

## Mechanical checklist

1. Inventory the model's `t2` call sites; separate convert-able (dynamic shape) from leave-alone.
2. Write the golden test first (old-vs-old, trivially green) — the safety net.
3. Write the `.sql` file (private `-- :name-`, `:value:` params, the four patterns).
4. Write the queries ns (declare + `def-sqlvec-fns` + executors).
5. Point call sites at executors; alias the queries ns `<model>.queries`, never bare `queries`.
6. Point the golden test's new side at the executors; run it, then `:module <name>` against a
   master baseline (some suites have pre-existing order-dependent failures).
7. `./bin/mage lint-raw-splices`; `./bin/mage fix-modules-config` if you added a namespace.
