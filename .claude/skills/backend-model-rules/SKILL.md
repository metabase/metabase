---
name: backend-model-rules
description: Where a rule about a Toucan 2 model lives and how to write it. Hooks hold only what the row itself answers and run no statement, the write functions in the model file's Writes section hold everything that needs another row and are the only writers of the model, `mi/can-*?` methods hold per-user rules, and each feature that needs to know something about a model reads it from that model's `<feature>/spec`. Use when adding or changing a model, a column, a hook, a write function, a permission check, an endpoint or tool that writes a model, a cascade, archiving, events, or a per-model spec. Preloaded by every `*-backend-expert` agent.
---

# Model rules

Every writer of a `:model/X` row goes through the model's write functions: REST endpoints, MCP and Metabot tools, the
Agent API, revision revert, and the sanctioned writers, which the product itself runs without a user (SerDes import,
remote-sync pull, sync, the audit and sample loaders, scheduled tasks). A write function takes many rows and uses a
number of statements that does not grow with them. Hooks run no statement at all, so a write of many rows can never
turn into a query per row. Permission checks run only for the user-facing writers.

## Pick the home for a rule

| The rule | Home |
|---|---|
| Depends on who is acting | `:can_read` / `:can_write` / `:can_query` hydration, `mi/can-create?`, `mi/can-update?` |
| Answered from the incoming row alone: type, length, range, enum, format, JSON shape, columns that must agree (`:multi` on a type column, `[:fn pred]`) | the entity schema in `<module>.schema`; never a hook |
| Needs the row and its stored version (`t2/changes`, `t2/original`): a default, a derived column, a frozen column, a combination that must hold after the change | `before-insert` and `before-update` |
| Needs any other row: a parent's state, uniqueness, a value copied from a parent | the write functions of the model |
| Keeps other rows in step (cascade, cleanup, upkeep of sibling rows) | the write function of the model whose change causes it, which calls the followers' write functions |
| Calls outside the app DB as part of a write (a Quartz trigger, a cache to drop) | the write function; after the commit when it must not be undone |
| Shapes a request (required key, friendly message, status order) | the endpoint |

A rule is an invariant only if every stored row satisfies it and no sanctioned writer needs an exception. If stored
rows break it, a data migration fixes them first (rename duplicates, rewrite a legacy shape) or the rule is a request
check on the write path. If a sanctioned writer must be exempt (remote-sync pull on a read-only instance, the audit
loader), the rule is a permission check.

## Hooks

Stock Toucan hooks, one per model and operation (a second definition replaces the first): `t2/define-before-insert`,
`t2/define-before-update`, `t2/define-before-delete`.

- **A hook runs no app-DB statement**: no `<module>.db` call, no Toucan query, no write of another model, no memoized
  lookup that may query, no Quartz call. In dev and test a pipeline override in `metabase.models.interface` counts
  the statements made while the hooks of a write run and throws on the first one.
- What a hook does: fills a default, derives a column from the row, refuses a change of a frozen column, refuses a
  combination of columns that the row and its stored version show to be wrong, and work in memory.
- Checks first, a flat list of `(when ...)` throwing `(ex-info (tru "...") {:status-code 400})`; then derivations;
  return the row. A key `assoc`ed onto the returned row is written. A hook never checks what the incoming row alone
  answers (length, enum, format, agreeing columns): the schema does.
- `before-update` receives the stored row with the changes merged in. `(t2/changes row)` holds only columns whose
  value differs from the stored one, and `(t2/original row)` the stored row as `after-select` returned it. Run a
  check only when a column it guards is in the changes; never validate a stored combination the write does not touch.
- Never read the current user (`api/*current-user-id*`, `mi/superuser?`, a permission call) or branch on which writer
  is calling (SerDes import, sync, an endpoint).
- No `after-insert` and no `after-update`: Toucan reads the written rows back for a model that has one, two statements
  per write, and whatever such a hook did belongs to the write function. `after-select` shapes a row in memory; what
  needs a query on read is a hydration.
- A value that depends on the row alone but needs the time or a random id is a SQL expression or a generated value,
  set the same for every row of the statement, so a bulk write stays one statement.
- **Derived column.** Never trusted from the caller: compute and overwrite on insert; recompute when its source
  changes; a change to it alone is a 400; leave it out of the request schema. A column derived from another row (a
  dashboard question's collection, a run's snapshot of its transform's name) is set by the write function.
- **Frozen column.** A column no update may change: `(when (contains? changes :table_id) (throw ...))`.
- **Query column.** `lib-be/transform-query` in `t2/deftransforms`, as Card's `dataset_query`. Written values are full
  queries. A legacy stored shape is rewritten by a data migration, never by `after-select`.
- **Rule over several rows.** Uniqueness needs a unique index, added after a changeset that renames existing
  duplicates (" (2)", " (3)"); decide what a NULL parent means, since an index treats NULLs as distinct. The write
  function may add the 400 message with one lookup for the batch; the index is the enforcement.

## Writes

Every model file has a `Writes` section, directly before `Specs`, with the functions that are the only writers of the
model in production. Hooks and writes sit in one file, so the whole logic of a model is read in one place.

- **Shape.** `mu/defn`, named `create-<entities>!`, `update-<entities>!`, `delete-<entities>!`, taking a collection
  and returning the written instances or rows. A singular `create-<entity>!` exists where callers write one row; a
  model that is only ever written one row at a time has only the singular ones. A function that fits none of the
  three keeps a domain name (`start-run!`, `end-sessions!`, `archive-in-collections!`).
- **Schemas.** `create-` takes `::<module>.schema/<entity>.create`, a closed map of exactly what a caller gives;
  `update-` takes rows of the primary key and `::<module>.schema/<entity>.update`. A function that fits neither may
  have its schema inline; a schema used from more than one file is an entry of `schema.clj`. The request schema of an
  endpoint lives in the API file and is never one of these, though it may share field schemas.
- **Bulk.** One read per kind of parent for the whole batch (by the distinct ids), checks in memory, one statement per
  distinct set of changes, one statement per kind of follower. No statement count may grow with the number of rows.
  Prove it with a `t2/with-call-count` test at two sizes (2 and 6 rows) that asserts the same count. The one accepted
  exception: `lib` and the query processor load metadata lazily and may query per card or per query; call them as
  they are called today (once per row), do not batch or change them, and do not count their statements.
- **Statements.** Toucan calls stay in `<module>/db.clj` (see `backend-module-conventions`); the write functions call
  the model's `db.clj` insert, update and delete functions, and nothing else in production calls those. The `db.clj`
  functions use `t2/insert-returning-instances!` and its counterparts, so the write function has the rows it
  publishes. A direct update of one counter or timestamp column that no rule cares about (`last_used_at`, a view
  count) may stay a plain `db.clj` statement; say so in its docstring.
- **Transaction and events.** A write function wraps its statements in `t2/with-transaction` and, inside it, after
  its last statement and its cascades, publishes its events by hand (see Events). A consumer that throws rolls the
  write back.
- **Callers.** Callers require the model namespace; `<module>/core.clj` does not re-export write functions. When
  another module calls one, `./bin/mage fix-modules-config` records the model namespace as API of its module. A kondo
  rule reports a `t2/insert!`, `t2/update!`, `t2/delete!` or a variant on a model that does not belong to the module of
  the file.
- **User-facing writers** check permissions before they call: parse the request, load the row with `api/check-404`,
  call `api/update-check` with the changes (or `api/create-check` with the whole new row), call the write function,
  return the hydrated row. A write function never reads the current user for a decision.
- **Sanctioned writers** call the same functions: SerDes and remote sync through the spec's `:insert!`, `:update!`
  and `:delete!`, revision revert through `:revert!`, a source replacement through the replacement spec's `:update!`,
  sync and the loaders directly, in bulk. A writer that needs fewer checks than a user (sync never moves a Table
  between Collections) gets a fast path of the same function, not a second route.
- A statement that bypasses the model (`t2/query` with hand-written SQL, a write against a table-name keyword) runs
  no hooks; use one only where a comment says why (the batched delete of a Database's Cards).
- Orchestration that spans several models from one request (saving a dashboard with its tabs and cards) may live in
  `<module>/write.clj`, calling only the models' write functions and holding no rule of its own.

### Cascades between models

- The model whose change causes a cascade calls the followers' bulk write functions from its own write function: a
  Collection carries its content when it is archived, restored, moved or deleted; a Dashboard its dashboard questions;
  a Database everything that belongs to it.
- Where the cause can require the follower's model namespace, it calls it directly. Where that is a load cycle, the
  cause's model file defines a multimethod dispatched on the follower model (`database/delete-for-databases!`,
  `collection/archive-in-collections!`), each follower implements it in its own model file with its own write
  function, and the cause walks an ordered list of follower models, loading each with `t2/resolve-model`. Never
  `requiring-resolve`.
- A hook someone else must implement and cannot be called directly is named for its one purpose and does nothing by
  default (`serialization.writes/insert-stub-users!`).
- A follower's function sets every column the cascade decides (`archived`, `archived_directly`, `collection_id`)
  explicitly; it reads nothing back from the cause.

## Permissions

| Question | Asked with | Answered by |
|---|---|---|
| May the user see this row | `(mi/can-read? row)`, `api/read-check` | `t2/batched-hydrate [:model/X :can_read]`, stored in the row's metadata |
| May the user change this row | `(mi/can-write? row)`, `api/write-check` | `t2/batched-hydrate [:model/X :can_write]`, a key of the row |
| May the user run queries on it | `(mi/can-query? row)`, `api/query-check` | `:can_query` hydration (Table, Database) |
| May the user create this | `(api/create-check :model/X new-row)` | `(defmethod mi/can-create? :model/X [_model row])` |
| May the user apply these changes | `(api/update-check row changes)` | `(defmethod mi/can-update? :model/X [row changes])` |

- `mi/can-read?`, `can-write?` and `can-query?` read the hydrated answer and throw when it is missing. For a list,
  `(mi/readable rows)` and `(mi/writable rows)` hydrate once and filter.
- A hydration answers a whole list in a fixed number of queries: load the parents (tables, collections) once.
- `can-update?` answers the whole question: it calls `(mi/can-write? row)` itself and adds what depends on the change
  (write access to the collection or table the row moves to, a superuser-only column with `(mi/superuser?)`, a sandbox
  restriction). Only two changes need no write access, each a named predicate: the public link of a Dashboard or Card,
  for a settings manager, and unsynced columns on a read-only remote-sync instance. `changes` may repeat stored values,
  so test a column with `(api/column-will-change? (:col row) (get changes :col ::api/not-provided))`.
- A rule `can-create?` and `can-update?` both apply is one private predicate. Both return a boolean and never throw.
- A row no writer may change (a built-in permissions group) is refused by one hook predicate, which also makes
  `:can_write` false so the UI can show it.
- `api/read-check` and `api/write-check` take the row (or model and id), throw 404 for nil and 403 when refused, and
  return the row. `api/create-check` and `api/update-check` throw 403. All four publish a permission-failure event.

## Events

- There is no automatic dispatch: no `:hook/events` trait, no `events/spec`, no event batch. A write function
  publishes, inside its transaction and as its last step, one event per operation and model:
  `:event/card-create`, `:event/card-update`, `:event/card-delete`.
- The payload carries the whole batch: `{:changes [{:object <after> :previous-object <before>} ...] :user-id <current
  user or nil> :context {...}}`. A create has `:object` only in each change, a delete `:previous-object` only.
  `:previous-object` comes from the read the write function made for its checks, `:object` from the statement's
  returned instances.
- A consumer takes the list and answers it with a number of statements that does not grow with it. It lives in
  `<module>/events.clj` or `<module>/events/<topic>.clj`, required from `init.clj`, as a
  `methodical/defmethod events/publish-event!` on a topic it derives.
- A consumer reads the database as it is when the event arrives, so a write function publishes after all its
  statements, cascades included; a follower publishes its own events from its own write function.
- A consumer that throws fails the write. Work that needs committed rows goes in `mdb/do-after-commit`.
- Records (revision, audit row) need a non-nil `:user-id`; a write the product makes in a user's request is no user
  action: its columns are in the `:skip` of its `audit/spec`, or it binds the current user to nil.
- A moment that is no row write (login, read, sync begin, transform run, user invited) is published where it happens.

## Specs

A feature that needs to know something about a model reads it from the model, never from a list of models of its
own. Each such feature has one multimethod, `<feature>/spec`, that a model implements once, in its model file, with a
literal map such as `{:track [...] :skip [...] :before-revert queries.revisions/before-revert}`.

- The multimethod lives in a small `<feature>/spec.clj`, dispatches on the model keyword and returns nil for a model
  without a spec. Its docstring, and its closed schema where it has one, is the reference for the keys. The feature's
  code (`events.clj`, jobs, API) names no `:model/X`.
- The model file only wires: the map's functions are imported, never written inline. Code of one model for one feature
  lives in `<the model's module>/<feature>.clj` (`queries/revisions.clj`, `dashboards/search.clj`), app-DB queries in
  `<module>/db.clj`. A spec that is plain data stays whole in the model file; do not create a near-empty file.
- A value that decides something is a function, not a format of its own: a keyword or a column set where that says it
  all, else a function. Keywords are written in full so that they can be searched.
- A spec found by a name (search model, item type, recent view, API name) maps each of the model's names to its entry,
  since Card answers to `"card"`, `"dataset"` and `"metric"`. The feature indexes them with
  `models.resolution/spec-entries-by-name`, which loads every model once and throws on a name two models declare.

| Spec | A model has one when | Keys |
|---|---|---|
| `app-db-copy/spec` | always: every model | `:skip?` (always given, `true` or `false`), `:select`, `:transform`, `:sequence` |
| `change-log/spec` | the change log tracks it | `:track`, `:skip` |
| `serialization/spec` | it is exported | `:schema`, `:copy`, `:skip`, `:transform`, `:defaults`, `:identity`, `:children`, `:parent`, and the fns `:storage-paths`, `:resource-paths`, `:export-dependencies`, `:import-dependencies`, `:loaded-entities`, `:entity-ref`, `:rows-by-refs`, `:rows-by-parent-pks`, and the write functions `:insert!`, `:update!`, `:delete!` |
| `remote-sync/spec` | remote sync syncs it | `:synced-items` (unless it is a SerDes child), `:name`, `:synced-filter-clause`, `:built-in-filter-clause` |
| `revisions/spec` | it has revisions, or its rows are parts of an entity that has | `:track`, `:skip`, `:parent`, `:children`, `:same?`, `:snapshot`, `:defaults`, `:before-revert`, `:revert!`, `:describe`, `:diff-columns`, `:authorize` |
| `audit/spec` | a user's write of it records an audit row | `:track`, `:track-redacted`, `:skip`, `:details`, `:state`, `:same?`, `:topics`, `:parent`, `:moments`, `:subject`, `:context-details?` |
| `search/spec` | it is searchable | per search model name: `:attrs`, `:search-terms`, `:embedding-exclude`, `:render-terms`, `:visibility`, `:where`, `:bookmark`, `:joins` |
| `dependencies/spec` | it is an entity of the graph (`:type`) or a part of one (`:part-of`); Dimension, FieldValues and Database have none, and the consumer handles their writes itself | `:type`, `:inlined?`, `:items`; `:hydrate`, `:dependencies`, `:analysis`, `:after-dependencies`; plain data `:dependency-columns`, `:analysis-columns`, `:output-columns`, `:part-of`, `:part-columns` |
| `replacement/spec` | it is a source a replacement can replace (`:source-database-id`), or its rows use one | `:source-database-id`, `:hydrate`, `:upgrade-field-refs`, `:swap-source`, `:update!` |
| `collection-items/spec` | it shows in a collection | per item name: `:items`, `:hydrate`, `:rank` |
| `recent-views/spec` | it shows in recent views | per name: `:load`, `:render`, `:type` |
| `staleness/spec` | it can be stale | `:candidates`, `:load`, `:render` |
| `eid-translation/spec` | it derives `:hook/entity-id` and the API translates its entity ids | `:names` |
| `xrays/spec` | the related-entities API finds entities related to it | `:related`, `:definition` |

What the shared keys mean, wherever they appear:

- `:insert!`, `:update!`, `:delete!`, `:revert!` name the write functions of the model, so a feature that writes a
  model writes it the way the product does. They take lists (`:revert!` one row) and return what they wrote; a
  function may leave a row out, and the feature matches the result to its input by primary key or identity columns,
  never by order. A feature has no `before-` or `after-` step of its own around a write.
- `:track` and `:skip` (change log, revisions, audit) list every column but `:id`, `:created_at` and `:updated_at`:
  the columns the feature follows, and those whose change alone it ignores. Audit splits the first: `:track` columns
  are stored in the row's details, `:track-redacted` ones record a row without their value. SerDes lists every column
  in `:copy`, `:skip` or `:transform`.
- `:parent {:model :model/Y :key :y_id}` makes a row a part of another entity (revisions, audit, SerDes, each adding
  keys of its own); `:children` nests the parts: `{key :model/Z}` in SerDes, `{key {:model :model/Z :as k}}` in
  revisions.
- `:hydrate` loads in bulk what the pure functions after it need, which take one hydrated row and query nothing:
  `:dependencies` (dependencies), `:upgrade-field-refs` and `:swap-source` (replacement). A collection-items `:hydrate`
  instead shapes the listed rows for the API.
- `:items` (collection items, dependencies) and `:candidates` (staleness) return the whole HoneySQL query of the
  model's rows, which the feature combines with the other models'. `:load` (recent views, staleness) takes ids and
  returns the rows to show, in bulk; `:render` turns one into the API item (nil leaves a recent view out).

### Adding or changing a model

- **A new model.** Give it `app-db-copy/spec`, then each spec whose feature it takes part in, a `Writes` section, and a
  require of its model file in its module's `init.clj`. Failing until then: `all-models-accounted-for-test` in
  `metabase.cmd.copy-test`, `tracked-models-test` in
  `metabase.change-log.events-test`, `spec-models-test` in `metabase.eid-translation.util-test` (entity ids need
  `:names` or a place in its not-translated list), `metabase-enterprise.serialization.models.entity-id-test`.
- **A new name.** `search-models-match-declared-spec-names-test` (`metabase.search.spec-test`),
  `model-param-values-match-item-names-test` (`metabase.collection-items.core-test`), `names-of-recent-views-test`
  (`metabase.activity-feed.recent-views.spec-test`) and `spec-names-test` (`metabase.eid-translation.util-test`)
  compare the declared names with the feature's own list.
- **A new column.** Put it in every spec of its model that lists columns: `:track` or `:skip` of the change log and of
  revisions, `:track`, `:track-redacted` or `:skip` of the audit log, `:copy`, `:skip` or `:transform` of SerDes;
  `spec-columns-test` in `metabase.change-log.events-test`, `metabase.revisions.spec-test` and
  `metabase.audit-app.spec-test`, and `specs-declare-exactly-table-columns-test` in `metabase.serialization.spec-test`
  fail until you do. A counter, a timestamp or a value the product sets goes in `:skip`, in one private var of the
  model file that each spec refers to.
- **A new part of an entity** (a row of a dashboard, a pulse, a table). Declare `:parent` in the specs that have one
  and `:part-of` in the dependencies spec; no feature needs a line of its own.
- **A spec's keys.** Every spec is checked against its feature's closed schema: `specs-match-spec-schema-test`
  (SerDes), `spec-schema-test` (audit, staleness, x-rays), `every-spec-is-valid-test` (dependencies, replacement,
  collection items, recent views), `every-search-model-has-valid-spec-test` (search). A new fact about models is a key
  of a spec with such a test, never a `case` on the model or a map from models in the feature's code.

## Archiving

Archiving is an update through the write function: `(update-<entities>! [{:id id :archived true}])`.

- `archived` is the state; `archived_directly` is the cause: true when archived on its own, false when it follows a
  parent. The write function sets both: a caller's own archive is direct unless its parent is archived (read once for
  the batch), a cascade passes `archived_directly false`, a restore clears it.
- A model with followers archives them from its write function, parent first, in one transaction: Collection its
  subtree and content, Dashboard its dashboard questions, Document its cards, Timeline its events (only on its own
  archive). The subtree ids are read once, then one call per kind of follower.
- A live row cannot be created in or moved into an archived parent; the write function checks it with the parents it
  read for the batch.
- A user-facing writer asks `api/update-check` on the parent with `{:archived x}`: its `mi/can-update?` covers every row
  the cascade writes, each kind loaded and answered once (`mi/can-update-followers?`, by default `can-update-each?`).
  A sandbox restriction belongs to `can-update?`, never to a hook or a write function.

## Lay out a model file

Banners `;;; ---- Hooks ----`, centred in a line of about 120 columns, in this order: `Definition` (the table name, the
derives, the transforms), `Hydration`, `Hooks`, `Permissions`, `Writes`, `Specs`. `Specs` comes last, as its maps refer
to functions above it, and holds every `defmethod <feature>/spec` of the file in the order of the table above, grouped
by model in the order the models are defined. A spec method uses the plain alias `<feature>/spec`: the core when it
re-exports `spec` and the file needs the core anyway (`[metabase.search.core :as search]`), else the spec namespace
(`[metabase.replacement.spec :as replacement]`), since some cores load too much for a model file. The model's own SerDes
functions live in `<module>.serialization`, which the model file requires and never the reverse.

A model file that implements a multimethod, hooks included, is required by its module's `init.clj`, so that its
implementations exist at startup whoever loads first. A test that relies on one requires the model namespace itself.

## Tests

- One `with-temp` default per model in `with-temp-defaults-fns` that passes its hooks; a fixture overrides a column only
  when the test depends on it. Build queries with `metabase.lib`.
- A model that a plain insert cannot store whole (a Tenant needs its Collection, a User its default groups, a
  PulseChannel its trigger) has a `t2.with-temp/do-with-temp*` method in `test/metabase/test/util.clj` that gives a
  temporary row what its create function gives it, by the same code.
- Test a hook through `t2/insert!` / `t2/update!`; a rule of a write function through that function; a permission rule
  through `api/create-check` / `api/update-check` as each kind of user; an event consumer by calling the write
  function, not by publishing the event; a write function or a list endpoint with `t2/with-call-count` at two sizes.
  Run the tests named under Adding or changing a model.
Before handing off: `./bin/mage kondo <file>`, `./bin/mage fix-modules-config`, and the tests of each writer you
touched.
