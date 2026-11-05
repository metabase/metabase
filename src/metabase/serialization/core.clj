(ns metabase.serialization.core
  "Serialization (SerDes): exporting the rows of models as entities and importing them back, in bulk.

  Terms:

  - model: a Toucan model, like `:model/Card`.
  - row: a row of a model as the store holds it, with database ids.
  - entity: the exported map of a row, holding references in place of its database ids.
  - entity id: the `entity_id` column of a row, `eid` for short.
  - reference: what an entity holds in place of a database id: the ref of the row it names, like an entity id, the
    `[db schema table]` of a Table, the `[db schema table field & nested]` of a Field, or the email of a User.
  - ref: the reference of a row, which finds it in a store (see [[metabase.serialization.protocol/select-by-refs]]).
  - parent, children: a row, and the rows of the models its spec's `:children` names that hold its primary key, which
    export nested in its entity and load with it.
  - spec: what an entity holds of a row of a model, column by column (see [[metabase.serialization.spec]]), with
    transforms like those of [[metabase.serialization.transform]].
  - store: what rows are read from and written to (see [[metabase.serialization.protocol/Store]]).
  - visit: `(visit model x)`, how a walk asks for the database id or reference `x` of a row of `model` to be
    resolved, which a batch does all at once (see [[metabase.serialization.resolve]]).
  - batch: the rows or entities processed together, up to [[batch-size]].
  - export: rows to entities, resolving database ids to references (see [[metabase.serialization.resolve]]).
  - import: entities to rows, resolving references to database ids and creating the Users, Databases, Tables and
    Fields the store lacks when asked to (see [[metabase.serialization.resolve]])."
  (:require
   [metabase.serialization.resolve :as resolve]
   [metabase.serialization.spec :as serialization.spec]
   [metabase.serialization.transform :as serialization.transform]
   [metabase.serialization.util :as serialization.util]
   [metabase.util.namespaces :as shared.ns]))

(shared.ns/import-fns
 [resolve
  collecting?
  export-in-bulk
  found-or-nil
  import-in-bulk
  target-not-found
  target-not-found?
  visit-some]
 [serialization.spec
  columns
  spec
  spec-of]
 [serialization.transform
  date-transform
  export-dates
  export-keywords
  export-unchanged
  import-dates
  import-keywords
  import-only-transform
  import-unchanged
  keyword-transform])

(def batch-size
  "The number of rows, ids or entities that serialization queries or processes together."
  serialization.util/batch-size)
