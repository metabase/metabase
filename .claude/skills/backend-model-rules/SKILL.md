---
name: backend-model-rules
description: Where a rule about a Toucan 2 model lives and how to write it. Hooks hold defaults, derived columns and what the row and its stored version answer, and never call the app DB; boundary schemas (API request, SerDes and revisions spec `:schema`) check single values; the write functions in the model file's Writes section take lists, hold everything that needs other rows, and publish the lifecycle events by hand; a parent's file is the only entry point to its children; `mi/can-*?` methods hold per-user rules. Use when adding or changing a model, a column, a hook, a write function, a schema, a permission check, an endpoint or tool that writes a model, a cascade, archiving, events, a per-model spec, or a test of any of these. Preloaded by every `*-backend-expert` agent.
---

# Model rules

Every writer of a `:model/X` row calls the model's write functions: REST endpoints, MCP and Metabot tools, the Agent
API, revision revert, SerDes import, remote-sync pull, sync, the loaders, scheduled tasks. A write function takes a
list and runs a number of statements that does not grow with it. Hooks run no statement, so a write of many rows
never becomes a query per row.

## Where a rule lives

| The rule | Home |
|---|---|
| Default value, also one read from a setting (a Table's humanized `display_name`) | hook |
| Derived column (a Segment's `table_id` from its `definition`, `updated_at`) | hook |
| Invalid combination of columns of one row, from the row and its stored version | hook |
| Per-row state transition that is not allowed; a frozen column (no update may change it) | hook, only where the rule already existed |
| Whether one value is valid (valid MBQL, enum, length) | boundary schema: API request schema, SerDes spec `:schema`, revisions spec `:schema`; never a hook |
| Needs other rows or the database (parent archived, cycle, uniqueness) | the write function, over all rows of the call |
| Depends on who is acting | `mi/can-*?` (see Permissions) |

- A hook never calls the app DB or anything external (a warehouse, the network); a cached setting read is neither.
  It does not check single values: every write would repeat the boundary's work (query validation per Card write).
- A combination check stays in the hook for every writer. Card has two: `check-model-query` (the type with the
  query: a model's native query has no variable or field filter) and `check-not-native-audit-db-query` (the database
  with the query type: no native query on the audit database).
- **A `before-update` hook returns the same changes for every row of one update.** Toucan runs an update of a model
  with such a hook in three steps: one SELECT of the matching rows; the hook once per row, in memory; then one UPDATE
  only if every row ended with the same change map, and otherwise one `UPDATE ... WHERE id = ?` per row, for all
  rows, even those that share a change map. So a hook that runs no statement can still multiply statements:

      (t2/define-before-update :model/Channel [channel]          ; WRONG: the name differs per row
        (cond-> channel
          (false? (:active (t2/changes channel)))
          (assoc :name (format "DEACTIVATED_%d %s" (:id channel) (:name channel)))))
      ;; (t2/update! :model/Channel :id [:in ids] {:active false}) -> 1 SELECT + one UPDATE per Channel

  The change map Toucan compares is each row's DIFF against its stored values, so two rules follow.
  1. What the hook adds to the changes is a function of the incoming changes and constants alone, never of the stored
     row. It breaks with a value built from the stored row (its id, its name) and with a value added only for some
     rows (`(when-not (:published_at stored) ...)`). A hook still READS the stored row to refuse a write (frozen
     column, invalid combination, state transition): a guard throws or leaves the changes alone, and adds no statement.
  2. A write function that updates several rows makes each `t2/update!` uniform itself, also without any derivation:
     an update of two or more columns over rows in mixed state (row A already holds one of the new values) splits
     too. It computes each row's changes against the stored rows it holds, adds the row-dependent derivations there,
     and groups the ids: `(mi/group-ids-by-changes stored rows)` gives `[[changes ids] ...]`, one statement each; the
     groups are bounded by combinations of columns, not by rows. A value that differs for every row is computed in
     Clojure and written by a named `db.clj` function in one statement with a CASE over the primary key
     (`channel.db/update-channels-with-names!`), never with SQL string functions, so it is identical on every app DB.
     Drop a key as unchanged only against the row as STORED: where after-select rewrites columns (Card's schema
     upgrade), the row the function holds is not the stored one, and the columns written in lockstep stay.
  In dev and test `mi/install-uniform-update-guard!` throws when the rows of one update end with different changes,
  before any UPDATE runs. Test a write function with rows that differ in stored state, not only uniform rows.
- No `after-insert` and no `after-update` hook: Toucan reads the written rows back for a model that has one, and a
  model publishes nothing from a hook; what such a hook did belongs to the write function.
- Converting a value (legacy query to MBQL 5, string to keyword) is the column transform's job (`t2/deftransforms`,
  `lib-be/transform-query`), not the caller's, the hook's or the write function's.
- Uniqueness: the write function checks all rows of the call with one read to give a friendly error. Never catch a
  constraint error for it; a concurrent race throws from the database.
- Do not add transition or frozen-column rules that were not there. Stock hooks only: `t2/define-before-insert`,
  `t2/define-before-update`; `(t2/changes row)` holds the changed columns. Checks first, then derivations:
```clojure
(t2/define-before-update :model/Segment
  [{:keys [definition] :as segment}]
  (let [changes (t2/changes segment)]
    (when (contains? changes :creator_id)
      (throw (ex-info (tru "You cannot change the creator of a Segment.") {:status-code 400})))
    (cond-> segment
      (contains? changes :definition) (assoc :table_id (definition-table-id definition)))))
```

## Write functions

The `Writes` section of the model file, directly before `Specs`, holds the only production writers of the model.

- One function per operation per model, taking a list: `create-<model>s!`, `update-<model>s!` (rows of `:id` and the
  columns to change), `delete-<model>s!` (ids). No single-row twin (callers pass `[x]`), no `-imported-` variant, no
  `foo*` layer, no `-where!` variant. A write that fits none keeps a named case function (`increment-view-counts!`).
- Optional last `opts`: a closed map of data, holding only keys the function uses; no `opts` argument when none is.
  - `:writer`, an enum: `:import`, `:revert`, `:replacement`, `:sync`, `:cascade`. Absent means a user's write. A
    function may branch on it (`update-cards!` skips result-metadata inference for any writer).
  - `:context`, the event context (`::events.schema/context`): `:revision-message`, `:archived-with`, `:details`.
  - Rows the caller already holds, as a list of instances under the plural model name. The keys that exist are
    `:tables`, `:fields` and `:databases`; the function does not read those rows again.
- A spec customises with a literal: `:insert! #(create-cards! % {:writer :import})`.
- No functions, partials or thunks passed between layers, `db.clj` included: pass data. No HoneySQL in arguments:
  a caller selects ids through a `<module>.db` read function and calls the normal write function.
- Batch (`partition-all`) only where very many ids are expected (sync's `update-tables!`), not everywhere.
- A write function opens its own `t2/with-transaction` and publishes its events inside it. A child function has
  none: it runs in its parent's. Atomicity across several calls is the caller's outer `t2/with-transaction`; no
  do-in-transaction helpers.
- A write function does not validate the shape of its input: the boundary did. Its `mu/defn` schemas run in dev and
  test only.
- Toucan calls live only in `<module>/db.clj` (see `backend-module-conventions`), called from the Writes section.
  One statement per distinct set of changes: `(group-by #(dissoc % :id) rows)`, then one `db.clj` update per group.
- In `db.clj`, no trivial select after a write: `t2/insert-returning-instances!` when the caller needs the rows it
  inserted, `t2/insert-returning-pks!` when it needs only the ids; never insert and then select the same rows by id.
- A bulk insert of rows with different key sets goes through `u/map-by-key-set`, as `segments.db/insert-segments!`:
  one insert of mixed rows puts NULL where a row leaves a column out, which a NOT NULL column with a default refuses.
- An upsert on a hot path (`upsert-field-user-settings!`): `db.clj` has a plain select, insert and update; the write
  function resolves a lost insert race once, by re-reading the row and updating it.
- An entry point shared by REST and MCP or Metabot validates in the shared function (`create-segment!` in
  `metabase.segments.rest.api` checks the definition), so no caller skips the check.
- A cascade to another model calls that model's write functions. Where requiring it would be a load cycle, the cause
  defines a multimethod the follower implements in its own file (`collection/archive-in-collections!`,
  `database/delete-for-databases!`) and loads the follower with `t2/resolve-model`, never `requiring-resolve`.

## Parent and children

A child is a row with no life outside its parent: no endpoint of its own, never written without the parent, deleted
with it. Dashcards, tabs and series of a Dashboard; cards, channels and recipients of a Pulse; the 1:1 detail row of
an Action (QueryAction, ImplicitAction). A Card in a Document is not a child: it has its own endpoints and events, so
the Document's function calls `create-cards!` / `update-cards!`.

- Child functions (`dashboard-card/create-dashboard-cards!`) are plain writes: no events and no transaction of their
  own, since the parent function that calls them has opened one.
- The parent's model file is the only entry point, also for other modules. `create-dashboards!` rows carry `:tabs`
  and `:dashcards` (each with `:series`) and publish one `:event/dashboard-create`. `update-dashboards!`,
  `add-dashcards!`, `update-dashcards!` and `remove-dashcards!` change parts of an existing Dashboard and publish one
  `:event/dashboard-update`, built with `events/touch-event` when only children changed.
- Consumers key on the parent's event and read the parts from the database. An audit row about parts comes from an
  explicit event the parent function publishes (`:event/dashboard-add-cards`, `:event/dashboard-remove-cards`).
- Action: `create-actions!` / `update-actions!` take the Action's columns together with those of its detail row and
  publish one Action event; the dependency marks read the detail row from the database on that event.
- SerDes writes children on their own, through the child specs' `:insert!` / `:update!` / `:delete!`, the plain child
  functions. For parents whose children an import changed, it calls the parent's `:update!` with `[{:id ..}]`; under
  `{:writer :import}` such a no-change row still publishes the parent's update. Accepted consequence: a new or
  column-changed parent gets two events on import, its own and one after its children.
- Children whose table the change log tracks log their rows in the plain write with `change-log/log-changes!`.
  A Revision or rolled-up audit row is made from the parent's event only, which the parent function publishes last.

## Events

- A write function publishes with plain `events/publish-event!`, inside its own transaction: no trait, no batch, no
  dynamic context. One event per operation and model: `:event/card-create`, `:event/card-update`,
  `:event/card-delete`.
- Payload: `{:changes [{:object after :previous-object before}] :user-id :writer :context}`. The builders take the
  function's opts as they are: `events/create-event`, `events/update-event`, `events/delete-event`,
  `events/touch-event` (before = after).
- Create and update events go after the function's statements. The delete event goes right before the delete
  statement, since consumers (search, the change log) read what the delete cascades to at that moment:
  `(events/publish-event! :event/segment-delete (events/delete-event segments))`, then `segments.db/delete-segments!`.
- A consumer is an ordinary `publish-event!` method on a key it derives; a consumer of every lifecycle topic derives
  its key from `:metabase/lifecycle-event`. It answers the whole list with statements that do not grow with it.
```clojure
(events/derive! :metabase/lifecycle-event ::change-log)
(methodical/defmethod events/publish-event! ::change-log
  [topic event]
  (when-let [events (not-empty (u.events/row-events topic event))] ...))
```
- The payload has no changed-columns key: compute with `metabase.util.events` (`changed-keys`, `changed?`,
  `touch?`, `row-events`). A consumer that treats a revert differently checks `(= :revert (:writer event))`.
- A consumer of a delete event still sees the doomed rows in the database and must exclude them.
- A consumer that throws fails the write. After-commit work (`mdb/do-after-commit`) runs at once when no transaction
  is open, so a test that publishes a delete by hand wraps it in `t2/with-transaction`.

## Schemas

`<module>/schema.clj` holds, per model, only these and schemas shared between files (see `metabase.segments.schema`):

| Schema | Holds |
|---|---|
| `::segment` | the row: primary key required, other columns and hydrated keys optional; what `db.clj` reads return |
| `::segment.create` | what `create-segments!` takes |
| `::segment.update` | what `update-segments!` takes, with `:id` where rows carry it |
| `::segment.revision` | a snapshot as a Revision stores it; a parent's nests its children's (`::dashboard.revision`) |

- A write-function variant with non-column keys, or a `db.clj` function whose input fits neither, has its schema
  right above it in its own file. A request schema sits above its endpoint in the API file.
- An endpoint uses `.create` / `.update` when they fit. The API may be stricter than other entry points: Card's
  request schema takes `::lib-be.schema/maybe-legacy-query` and refuses an empty query, while `::card.create` takes
  `::lib-be.schema/maybe-legacy-or-empty-query`, since empty queries are stored and a revert may write one.
- Never `:map`, `[:sequential :map]` or `[:map-of id :map]` for rows; close every map.

## One pattern for every entry point

Each entry point decodes its input through a schema, validates it, then calls the write function: the API with the
request schema, SerDes with the spec `:schema`, Revisions with the `revisions/spec` `:schema` (a revert decodes the
stored snapshot through it, which is where older snapshot formats are handled). User-facing writers check permissions
before the call; a write function never reads the current user for a decision.

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
  restriction). A change that needs no write access is a named predicate: the public link of a Dashboard or Card, for
  a settings manager (`changes-only-public-link?`), and unsynced columns on a read-only remote-sync instance
  (`remote-sync/synced-changes?`). `changes` may repeat stored values, so test a column with
  `(api/column-will-change? (:col row) (get changes :col ::api/not-provided))`.
- A rule `can-create?` and `can-update?` both apply is one private predicate. Both return a boolean and never throw.
- `api/read-check` and `api/write-check` take the row (or model and id), throw 404 for nil and 403 when refused, and
  return the row. `api/create-check` and `api/update-check` throw 403. All four publish a permission-failure event.

## Specs

A feature that needs to know something about a model reads it from the model, never from a list of models of its
own. Each such feature has one multimethod, `<feature>/spec`, that a model implements once, in its model file, with a
literal map such as `{:track [...] :skip [...] :schema ::segments.schema/segment.revision :revert! revert-segment!}`.

- The multimethod lives in a small `<feature>/spec.clj`, dispatches on the model keyword and returns nil for a model
  without a spec. Its docstring, and its closed schema where it has one, is the reference for the keys. The feature's
  code (`events.clj`, jobs, API) names no `:model/X`.
- The model file only wires: the map's functions are imported, apart from the write-function literals. Code of one
  model for one feature lives in `<the model's module>/<feature>.clj` (`queries/revisions.clj`,
  `dashboards/revisions.clj`), app-DB queries in `<module>/db.clj`. A spec that is plain data stays whole in the
  model file; do not create a near-empty file.
- A value that decides something is a function, not a format of its own: a keyword or a column set where that says it
  all, else a function. Keywords are written in full so that they can be searched.
- A spec found by a name (search model, item type, recent view, API name) maps each of the model's names to its entry,
  since Card answers to `"card"`, `"dataset"` and `"metric"`. The feature indexes them with
  `models.resolution/spec-entries-by-name`, which loads every model once and throws on a name two models declare.

| Spec | A model has one when | Keys |
|---|---|---|
| `app-db-copy/spec` | always: every model | `:skip?` (always given, `true` or `false`), `:select`, `:transform`, `:sequence` |
| `change-log/spec` | the change log tracks it | `:track`, `:skip` |
| `serialization/spec` | it is exported | `:schema`, `:copy`, `:skip`, `:transform`, `:defaults`, `:identity`, `:children`, `:parent`, and the fns `:storage-paths`, `:resource-paths`, `:export-dependencies`, `:import-dependencies`, `:loaded-entities`, `:before-load`, `:after-load`, `:entity-ref`, `:rows-by-refs`, `:rows-by-parent-pks`, and the write functions `:insert!`, `:update!`, `:delete!` |
| `remote-sync/spec` | remote sync syncs it | `:synced-items` (unless it is a SerDes child), `:name`, `:synced-filter-clause`, `:built-in-filter-clause` |
| `revisions/spec` | it has revisions; a child has none, its parent's `:schema` nests it | `:track`, `:skip`, `:schema`, `:same?`, `:snapshot`, `:defaults`, `:before-revert`, `:revert!`, `:describe`, `:diff-columns`, `:authorize` |
| `audit/spec` | a user's write of it records an audit row | `:track`, `:track-redacted`, `:skip`, `:hydrate`, `:details`, `:state`, `:same?`, `:topics`, `:parent`, `:moments`, `:subject`, `:context-details?`, `:touch` |
| `search/spec` | it is searchable | per search model name: `:attrs`, `:search-terms`, `:embedding-exclude`, `:render-terms`, `:visibility`, `:where`, `:bookmark`, `:joins` |
| `dependencies/spec` | it is an entity of the graph (`:type`) or a part of one (`:part-of`) | `:type`, `:inlined?`, `:items`; `:hydrate`, `:dependencies`, `:analysis`, `:after-dependencies`; plain data `:dependency-columns`, `:analysis-columns`, `:output-columns`, `:part-of`, `:part-columns` |
| `replacement/spec` | it is a source a replacement can replace (`:source-database-id`), or its rows use one | `:source-database-id`, `:hydrate`, `:upgrade-field-refs`, `:swap-source`, `:update!` |
| `collection-items/spec` | it shows in a collection | per item name: `:items`, `:hydrate`, `:rank` |
| `recent-views/spec` | it shows in recent views | per name: `:load`, `:render`, `:type` |
| `staleness/spec` | it can be stale | `:candidates`, `:load`, `:render` |
| `eid-translation/spec` | it derives `:hook/entity-id` and the API translates its entity ids | `:names` |
| `xrays/spec` | the related-entities API finds entities related to it | `:related`, `:definition` |

What the shared keys mean, wherever they appear:

- `:insert!`, `:update!`, `:delete!` (SerDes), `:update!` (replacement) and `:revert!` (revisions) name the write
  functions of the model, so a feature that writes a model writes it the way the product does. They take lists
  (the replacement `:update!` a vector of rows, `:revert!` the id, the user id and the decoded snapshot) and return
  what they wrote; a function may leave a row out, and the feature matches the result to its input by primary key or
  identity columns, never by order.
- `:schema` is the boundary schema of the feature's input: the exported entity in SerDes, the snapshot in revisions.
- `:track` and `:skip` (change log, revisions, audit) list every column but `:id`, `:created_at` and `:updated_at`:
  the columns the feature follows, and those whose change alone it ignores. Audit splits the first: `:track` columns
  are stored in the row's details, `:track-redacted` ones record a row without their value. SerDes lists every column
  in `:copy`, `:skip` or `:transform`.
- `:parent {:model :model/Y :key :y_id}` makes a row a part of another entity (audit, SerDes, each adding keys of its
  own); SerDes `:children` nests the parts as `{key :model/Z}`.
- `:hydrate` loads in bulk what the pure functions after it need, which take one hydrated row and query nothing:
  `:dependencies` (dependencies), `:upgrade-field-refs` and `:swap-source` (replacement), `:details` (audit). A
  collection-items `:hydrate` instead shapes the listed rows for the API.
- `:items` (collection items, dependencies) and `:candidates` (staleness) return the whole HoneySQL query of the
  model's rows, which the feature combines with the other models'. `:load` (recent views, staleness) takes ids and
  returns the rows to show, in bulk; `:render` turns one into the API item (nil leaves a recent view out).

### Adding or changing a model

- **A new model.** Give it `app-db-copy/spec`, then each spec whose feature it takes part in, a `Writes` section,
  and a require of its model file in its module's `init.clj`. Failing until then: `all-models-accounted-for-test` in
  `metabase.cmd.copy-test`, `tracked-models-test` in `metabase.change-log.events-test`, `spec-models-test` in
  `metabase.eid-translation.util-test` (entity ids need `:names` or a place in its not-translated list),
  `metabase-enterprise.serialization.models.entity-id-test`.
- **A new name.** `search-models-match-declared-spec-names-test` (`metabase.search.spec-test`),
  `model-param-values-match-item-names-test` (`metabase.collection-items.core-test`), `names-of-recent-views-test`
  (`metabase.activity-feed.recent-views.spec-test`) and `spec-names-test` (`metabase.eid-translation.util-test`)
  compare the declared names with the feature's own list.
- **A new column.** Put it in every spec of its model that lists columns: `:track` or `:skip` of the change log and of
  revisions, `:track`, `:track-redacted` or `:skip` of the audit log, `:copy`, `:skip` or `:transform` of SerDes;
  `spec-columns-test` in `metabase.change-log.events-test`, `metabase.revisions.spec-test` and
  `metabase.audit-app.spec-test`, and `specs-declare-exactly-table-columns-test` in `metabase.serialization.spec-test`
  fail until you do. Add it to the model's schemas too: `::model`, `.create`, `.update`, and `.revision` if tracked.
- **A new child of an entity** (a dashcard, a pulse card, a suite member). Write it from the parent's functions with
  plain writes that publish nothing, nest it under the parent's SerDes `:children` and in the parent's `.revision`
  schema, and set `:written-with-parts? true` in the parent's dependencies spec so that every update of the parent
  marks it. A part that publishes its own events (a Field of a Table) declares `:part-of` instead.
- **A spec's keys.** Every spec is checked against its feature's closed schema: `specs-match-spec-schema-test`
  (SerDes), `spec-schema-test` (audit, staleness, x-rays), `every-spec-is-valid-test` (dependencies, replacement,
  collection items, recent views), `every-search-model-has-valid-spec-test` (search). A new fact about models is a key
  of a spec with such a test, never a `case` on the model or a map from models in the feature's code.

## Archiving

- Archiving is an update: `(update-dashboards! [{:id id :archived true}])`. `archived` is the state,
  `archived_directly` the cause. The write function sets `archived_directly`, not a hook, because it reads the
  parent's state: true when the row is archived on its own, false when its parent is archived; a cascade gives it.
- A Collection carries its content through cascade multimethods taking `[model collection-ids opts]`:
  `collection/archive-in-collections!`, `restore-in-collections!`, `delete-in-collections!`. Each follower implements
  them in its own model file with its own write function and passes `opts` on.
- The carried rows' events say what carried them: `{:context {:archived-with [:model/Collection id]}}`.
- A live row cannot be created in or moved into an archived parent; the write function checks it with the parents it
  read for the call. A user-facing writer asks `api/update-check` on the parent with `{:archived x}`: its
  `mi/can-update?` covers every row the cascade writes, each kind loaded and answered once
  (`mi/can-update-followers?`, by default `mi/can-update-each?`).

## Enforcement

- In dev and test, `metabase.models.interface` wraps the hooks of every `:metabase/model`; a hook that runs a
  statement throws `The before-insert hook of :model/X ran 1 app-DB statement(s); a hook must not query the app DB.`
  It counts Toucan statements only: it cannot see a warehouse or network call, and skips the settings cache refresh.
- Kondo `:metabase/foreign-model-write` reports a `t2/insert!`, `t2/update!` or `t2/delete!` on a `:model/X` that
  another module owns: call that module's write function. No suppressions for either rule; fix the code.

## Lay out a model file

Banners `;;; ---- Hooks ----`, centred in a line of about 120 columns: `Definition`, `Hydration`, `Hooks`,
`Permissions`, `Writes`, `Specs`. `Specs` comes last, as its maps refer to the functions above it. A model file is
required by its module's `init.clj`.

## Tests

- `mt/with-temp` is a plain insert and a plain delete for every model: it calls no write function and publishes
  nothing. A test that depends on a value within the row (a derived `collection_id`) sets it in the fixture.
  Two `t2.with-temp/do-with-temp*` methods in `test/metabase/test/util.clj` are the stated exceptions:
  `:model/Tenant` inserts the one Collection its NOT NULL `tenant_collection_id` needs, and `:model/Dimension` takes
  a lock, since concurrent temporary Dimensions deadlock on MySQL.
- One `with-temp` default per model in `with-temp-defaults-fns`; a fixture overrides a column only when the test
  depends on it. Build queries with `metabase.lib`.
- A test that depends on rows made as a side effect (ParameterCards, a search document, an audit row, a Revision)
  calls the real write function, plainly, inside `mt/with-model-cleanup`; no helper macro wraps that:
  `(mt/with-model-cleanup [:model/Card] (let [[card] (card/create-cards! [{...}])] ...))`.
- No manual deletes. One exception: a test that syncs nested Fields ends with `database/delete-databases!`, since on
  MySQL the Field parent reference is ON DELETE RESTRICT and a plain delete cannot remove them.
- **Every write function has a statement-count test.** Call it with 2 rows and with 6 rows and assert the same number
  of statements, counted by Toucan's own hook `t2/with-call-count` through
  `(metabase.events.test-util/statement-count! thunk)`, which turns consumers off so the number does not depend on
  test order. Take one discarded measurement first so one-time cache reads do not count. A function that fails has an
  N+1: fix the function, never the test.
- **Never pin a statement count to a number.** `(is (= 12 (call-count)))` breaks on every harmless change, differs by
  edition and app DB, and proves nothing about growth. Only the comparison matters: one discarded warm-up call, then
  the same count at two sizes. This holds for every call-count test, of a write function, an endpoint or a consumer.

      (deftest write-function-statement-counts-do-not-grow-with-rows-test
        (mt/with-model-cleanup [:model/TransformTag]
          (let [create! #(transform-tag/create-transform-tags! (mapv (fn [_] {:name (mt/random-name)}) (range %)))
                counted (fn [n] (events.tu/statement-count! #(create! n)))]
            (counted 1)
            (is (= (counted 2) (counted 6))))))
- Call a failure order-dependent only if the test passes alone on the branch and alone on the base.
- Locally, run single namespaces with a 10-minute timeout (`./bin/test-agent :only '[...]'`); bigger runs go to CI.
  Before handing off: `./bin/mage kondo <file>` and `./bin/mage fix-modules-config`.
