---
name: backend-model-rules
description: Where a rule about a Toucan 2 model lives and how to write it. Hooks hold invariants that do not depend on the user, `mi/can-*?` methods hold per-user rules, write paths call `api/*-check` and open a batch of writes, and each feature that needs to know something about a model reads it from that model's `<feature>/spec`. Use when adding or changing a model, a column, a hook, a permission check, an endpoint or tool that writes a model, a cascade, archiving, or a per-model spec. Preloaded by every `*-backend-expert` agent.
---

# Model rules

Every writer of a `:model/X` row goes through the model: REST endpoints, MCP and Metabot tools, the Agent API,
revision revert, and the sanctioned writers, which the product itself runs without a user (SerDes import, remote-sync
pull, sync, the audit and sample loaders, scheduled tasks). Hooks run for every writer; permission checks run only for
the user-facing ones. Put a rule every writer must obey in a hook and a rule only users must obey in a permission check.

## Pick the home for a rule

| The rule | Home |
|---|---|
| Depends on who is acting | `:can_read` / `:can_write` / `:can_query` hydration, `mi/can-create?`, `mi/can-update?` |
| Answered from the incoming row alone: type, length, range, enum, format, JSON shape, columns that must agree (`:multi` on a type column, `[:fn pred]`) | the entity schema in `<module>.schema`, which the API request schema and the SerDes spec `:schema` are built from; never a hook |
| Needs the database or the stored row (`t2/changes`, `t2/original`) | `before-insert` and `before-update` |
| Computes a column from other columns of the row | hooks; the caller does not supply it |
| Reads another entity's column that cannot change | hooks of the referring model |
| Reads another entity's column that can change | freeze it, cascade from it, or check at use (below) |
| Keeps other rows in step (cascade, cleanup) | the model whose change causes it: `mi/after-archived-change` for `archived`, else `before-update` / `before-delete` |
| Shapes a request (required key, friendly message, status order) | the write function or endpoint |

A rule is an invariant only if every stored row satisfies it and no sanctioned writer needs an exception. If stored
rows break it, a data migration fixes them first (rename duplicates, rewrite a legacy shape) or the rule is a request
check on the write path. If a sanctioned writer must be exempt (remote-sync pull on a read-only instance, the audit
loader), the rule is a permission check.

## Hooks

Stock Toucan hooks, one per model and operation (a second definition replaces the first): `t2/define-before-insert`,
`t2/define-before-update`, `t2/define-before-delete`, and `t2/define-after-insert` / `t2/define-after-update` for work
that needs the row as stored.

- Checks first, a flat list of `(when ...)` throwing `(ex-info (tru "...") {:status-code 400})`; then derivations;
  then cascades, which see the derived values; return the row. A key `assoc`ed onto the returned row is written. A
  hook never checks what the incoming row alone answers (length, enum, format, agreeing columns): the schema does.
- `before-update` receives the stored row with the changes merged in. `(t2/changes row)` holds only columns whose
  value differs from the stored one, and `(t2/original row)` the stored row as `after-select` returned it. Run a
  check only when a column it guards is in the changes; never validate a stored combination the write does not touch.
- Never read the current user (`api/*current-user-id*`, `mi/superuser?`, a permission call) or branch on which writer
  is calling (SerDes import, sync, an endpoint).
- Hold an invariant whatever the premium token says: a `defenterprise` function a hook calls is `:feature :none`.
- A hook may read another row through a `<module>.db` function. It sees stored rows, not those of its own statement,
  so a writer whose rows depend on each other writes them in separate statements, dependency first. A check that
  needs the row's id (cycle detection) runs in `before-update` only.
- Publish no event and record nothing in a model's own hook: consumers react to its lifecycle events (see Events).
- **Derived column.** Never trusted from the caller: compute and overwrite on insert; recompute when its source
  changes; a change to it alone is a 400; leave it out of the request schema. A column derived only in some states
  (a model's `display` is `:table`) is overwritten in those states and keeps the caller's value in the others.
- **Frozen column.** A column no update may change: `(when (contains? changes :table_id) (throw ...))`. It is the first
  choice for a rule on another entity: `table_id` on Field, `db_id` on Table, `namespace` on Collection.
- **Query column.** `lib-be/transform-query` in `t2/deftransforms`, as Card's `dataset_query`. Written values are full
  queries. A legacy stored shape is rewritten by a data migration, never by `after-select`.
- **Rule over several rows.** Uniqueness needs a unique index, added after a changeset that renames existing
  duplicates (" (2)", " (3)"); decide what a NULL parent means, since an index treats NULLs as distinct. A hook check
  may add the 400 message; the index is the enforcement.
- **Cascade.** The model whose change causes it writes the followers through their models, so their hooks run and may
  refuse: in `mi/after-archived-change` when it follows `archived` (see Archiving), else in `before-update` or
  `before-delete`, only when the causing column is in `(t2/changes row)`. `before-update` runs before Toucan opens its
  transaction, so a model whose update writes other rows declares `(mi/define-update-in-transaction :model/X)`.
- **Rule on another entity's mutable data.** In this order: freeze the column; cascade from the other entity (archived,
  deleted, moved, deactivated); check where the entity is used. Do not check the same rule in the hooks of both.

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

## Write paths

**A plain `t2/insert!`, `t2/update!` or `t2/delete!` on `:model/X` does the right thing, whoever calls it.** People
write `(t2/insert! :model/Card ...)` in a `<module>/db.clj` function and expect a correct Card. So nothing a row needs
may live in a function that wraps the write: there is no `create-card!` that differs from the insert in `db.clj`.
Existing wrappers that still do more are known gaps being removed over time; do not copy them.

What a writer used to do in such a function has one of these homes:

| It | Home |
|---|---|
| fills a default (`parameters []`, `type :question`) | the entity schema in `<module>/schema.clj` that every entry point decodes with |
| normalizes a value (a query, keywords, a legacy shape) | the same schema; the API, SerDes, MCP and the tools decode their input with it, and nothing normalizes after that |
| checks what the row alone answers | the same schema |
| checks against the database, derives a column, keeps other rows in step (a dashboard question gets its dashcard, positions in a collection are reconciled) | the model's hooks |
| reacts to the write (revision, audit row, search index, dependencies) | a consumer of the model's events, through its spec |
| asks whether this user may do it | `mi/can-create?` / `mi/can-update?`, called by the entry point with `api/create-check` / `api/update-check` |
| serves only an entry point (the API computes result metadata for a new card and waits for it briefly; a request key that is no column; the shape of the response) | that entry point: `api.clj`, or a `<module>/<name>.clj` that `api.clj` calls when the block stands on its own |

- A model file has no public write function. `<module>/db.clj` holds the statements, each a plain call through the
  model, named for what it does; a state change of a row the product owns (a run starts, a task ends) is one of them.
- An entry point parses and decodes the request with the schema, loads the row with `api/check-404`, calls
  `api/update-check` with the changes (or `api/create-check` with the whole new row), calls the `db.clj` function, and
  returns the hydrated row. A bulk endpoint hydrates `:can_write` once.
- A statement that bypasses the model (`t2/query` with hand-written SQL, a write against a table-name keyword) runs
  no hooks and publishes nothing; do not write that way.
- A caller opens `events/with-batched-events` around a write of several rows of one aggregate, so its reactions
  happen once per owner (nothing on a throw; nested batches join), and `events/with-event-context` for what the
  write's records need. Replacing the parts of an entity with a new list (dashcards, tabs, channels) is one shared
  helper that compares the lists and calls the plain statements; it holds no rule of its own.
- Nobody publishes a lifecycle event by hand. A model that publishes derives `:hook/events` and implements
  `events/spec`, `{operation topic}` with full keywords, which may omit an operation; every write then publishes in its
  transaction. The topic is named after the model (`:event/pulse-update`); the audit consumer chooses the topic it
  stores. A moment that is a column change (public link, publish) is derived by its consumer with `u.events/changed?`;
  only a moment that is no row write (login, read, sync begin, transform run, user invited) is published by hand.
- To check a rule, write the row with a plain `t2/` call in a test and look at what is stored and what reacted. If
  that differs from what the endpoint leaves, the model is wrong.

## Events

- The payload is `{:object <after> :previous-object <before> :user-id <current user or nil> :context {...}}`
  (`::events.schema/lifecycle`): a create has `:object` only, a delete `:previous-object` only. Compare columns with
  `u.events/changed?`, `changed-any?` and `changed-keys` (`metabase.util.events`): a merged batch has no "changes".
- `events/with-event-context` keys: `:revision-message` (message of the revisions), `:reverting?` (a revert's writes),
  `:details` (a map the audit row of some models takes), `:archived-with` (`[model id]` of the archive that carried the
  row).
- A consumer lives in `<module>/events.clj` or `<module>/events/<topic>.clj`, required from `init.clj`, as a
  `methodical/defmethod events/publish-event!` on a topic it derives; `events/register-owned-consumer!` gives it one
  call per owner per batch (`{:last? true}` runs it after the others). A sink (`events/register-sink!`,
  `events/add-to-sink!`) collects items such as audit rows and flushes them once at the end of the batch.
- `events/register-capture!` (a DELETE's events, after its before-delete hooks) and `register-statement-capture!` (its
  rows, before them) run once per DELETE statement to read rows `ON DELETE CASCADE` removes, for the handler's
  `:captures`.
- Delivery runs in the write's transaction, so a consumer that throws fails the write. Work that needs committed rows
  goes in `mdb/do-after-commit`; effects that leave the transaction run after it (the explicit initial sync of the
  database API, `quick-task`s).
- Upkeep (subscription sync, persisted models, driver pools, personal collections, session revoke, dependency marks)
  runs for every writer; a writer calls what only it starts (`sync/start-initial-sync!`). Records (revision, audit
  row) need a non-nil `:user-id`, and archive-carried writes (`:archived-with`) record nothing.
- A user's update of an audited model always records an audit row; only a change of nothing but the `:skip` columns of
  its `audit/spec` and archive-carried writes do not. A write the product makes in a user's request is no user action:
  its columns are in `:skip`, or it binds the current user to nil (`request/with-current-user nil`).
- The SerDes import validates every entity against its spec `:schema` (the strict write variant of the entity schema);
  `serialization-skip-schema-validation` only normalizes. An import started by a user records as that user's edits.
- The request schema is closed and lists only what a caller may set: no derived columns, no `archived_directly`.
- Entity schemas have a strict write variant (closed, what a caller may set) and a tolerant stored-row variant (what
  `after-select` returns, including legacy shapes); the request schema and the SerDes spec use the write variant.

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
| `events/spec` | it derives `:hook/events` | `{:create :event/x-create :update :event/x-update :delete :event/x-delete}`, any of them left out |
| `app-db-copy/spec` | always: every model | `:skip?` (always given, `true` or `false`), `:select`, `:transform`, `:sequence` |
| `change-log/spec` | the change log tracks it | `:track`, `:skip` |
| `serialization/spec` | it is exported | `:schema`, `:copy`, `:skip`, `:transform`, `:defaults`, `:identity`, `:children`, `:parent`, and the fns `:storage-paths`, `:resource-paths`, `:export-dependencies`, `:import-dependencies`, `:loaded-entities`, `:before-load`, `:after-load`, `:entity-ref`, `:rows-by-refs`, `:rows-by-parent-pks` |
| `remote-sync/spec` | remote sync syncs it | `:synced-items` (unless it is a SerDes child), `:name`, `:synced-filter-clause`, `:built-in-filter-clause` |
| `revisions/spec` | it has revisions, or its rows are parts of an entity that has | `:track`, `:skip`, `:parent`, `:children`, `:same?`, `:snapshot`, `:defaults`, `:before-revert`, `:revert!`, `:describe`, `:diff-columns`, `:authorize` |
| `audit/spec` | a user's write of it records an audit row | `:track`, `:track-redacted`, `:skip`, `:details`, `:state`, `:same?`, `:topics`, `:parent`, `:moments`, `:subject`, `:context-details?` |
| `search/spec` | it is searchable | per search model name: `:attrs`, `:search-terms`, `:embedding-exclude`, `:render-terms`, `:visibility`, `:where`, `:bookmark`, `:joins` |
| `dependencies/spec` | it is an entity of the graph (`:type`) or a part of one (`:part-of`); Dimension, FieldValues and Database have none, and the consumer handles their writes itself | `:type`, `:inlined?`, `:items`; `:hydrate`, `:dependencies`, `:analysis`, `:after-dependencies`; plain data `:dependency-columns`, `:analysis-columns`, `:output-columns`, `:part-of`, `:part-columns` |
| `replacement/spec` | it is a source a replacement can replace (`:source-database-id`), or its rows use one | `:source-database-id`, `:hydrate`, `:upgrade-field-refs`, `:swap-source` |
| `collection-items/spec` | it shows in a collection | per item name: `:items`, `:hydrate`, `:rank` |
| `recent-views/spec` | it shows in recent views | per name: `:load`, `:render`, `:type` |
| `staleness/spec` | it can be stale | `:candidates`, `:load`, `:render` |
| `eid-translation/spec` | it derives `:hook/entity-id` and the API translates its entity ids | `:names` |
| `xrays/spec` | the related-entities API finds entities related to it | `:related`, `:definition` |

What the shared keys mean, wherever they appear:

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

- **A new model.** Give it `app-db-copy/spec`, `events/spec` when anything reacts to its writes, then each spec whose
  feature it takes part in. Failing until then: `all-models-accounted-for-test` in `metabase.cmd.copy-test`,
  `every-trait-model-has-spec-test` in `metabase.events.batch-test`, `tracked-models-test` in
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

`(t2/update! :model/X :id id {:archived true})` does everything, for every writer. No archive logic in endpoints.

- `archived` is the state; `archived_directly` is the cause: true when archived on its own, false when it follows a
  parent. In `before-update`, when `archived` changes:
  `(assoc row :archived_directly (mi/archived-directly row parent-archived?))`; `parent-archived?` is a function of no
  arguments returning whether the parent is archived (its Collection, `collection/archived?`; for a Card also its
  Dashboard or Document, for a Document also its Exploration). A cause given in the changes is kept; a restore is false.
- The parent is written first and the followers after it, in the same transaction and one event batch: a model with
  followers declares `(mi/define-update-in-transaction :model/X)` and a
  `(defmethod mi/after-archived-change :model/X [model rows changes])` that writes them through their models, one
  statement per kind. The followers find their parent archived and derive their cause from it.
- Collection archives its subtree in a fixed number of statements and does not cascade again when it inherits an
  archive. Dashboard carries its dashboard questions, Document its cards, Timeline its events (only on its own archive).
- A live row cannot be inserted or moved into an archived parent (`collection/check-collection-not-archived`).
- A user-facing writer asks `api/update-check` on the parent with `{:archived x}`: its `mi/can-update?` covers every row
  the cascade writes, each kind loaded and answered once (`mi/can-update-followers?`, by default `can-update-each?`).
  A sandbox restriction belongs to `can-update?`, never to hooks. An owned part no user writes (a Summary's Document
  and Cards) answers an archive-only change at its owner; a carried snippet asks only the sandbox guard.

## Lay out a model file

Banners `;;; ---- Hooks ----`, centred in a line of about 120 columns, in this order: `Definition` (the table name, the
derives, the transforms), `Hydration`, `Hooks`, `Permissions`, `Specs`. `Specs` comes last, as its maps refer to
functions above it, and holds every `defmethod <feature>/spec` of the file in the order of the table above, grouped by
model in the order the models are defined. A spec method uses the plain alias `<feature>/spec`: the core when it
re-exports `spec` and the file needs the core anyway (`[metabase.search.core :as search]`), else the spec namespace
(`[metabase.replacement.spec :as replacement]`), since some cores load too much for a model file. The model's own SerDes
functions live in `<module>.serialization`, which the model file requires and never the reverse.

## Tests

- One `with-temp` default per model in `with-temp-defaults-fns` that passes its hooks; a fixture overrides a column only
  when the test depends on it. Build queries with `metabase.lib`.
- Test a hook through `t2/insert!` / `t2/update!`; a permission rule through `api/create-check` / `api/update-check` as
  each kind of user; an event consumer by writing the row, not by publishing the event; a list endpoint with
  `t2/with-call-count` at two sizes. Run the tests named under Adding or changing a model.
Before handing off: `./bin/mage kondo <file>`, `./bin/mage fix-modules-config`, and the tests of each writer you
touched.
