(ns metabase.change-log.core
  "The change log offers opt-in change tracking for writes to Toucan models by logging the last 30 days of
  changes, gated behind the `:change-log` token feature.

  It's not meant to be a complete record of all database writes: not all models are tracked, db migrations are not
  tracked, and direct table writes should manually log changes, but can opt out. Some changes, like re-sync
  fingerprinting and view counts, are not tracked to reduce load. So you get changes to tracked models minus changes
  containing only ignored columns.

  It is meant to provide separate apps, like Overwatch, with efficient app DB synchronization of opted-in changes. If
  we want to capture more in the change log, we update Metabase to track more.

  An app that wants to synchronize logged app DB changes should note the current change log position, snapshot the
  tables it cares about, then poll the change log for new changes since the last seen position. Each change lists the
  table and pk that needs to be fetched again. If you want non-tracked tables, or if you want to see changes that are
  not captured, you will need to periodically snapshot those tables.

  Each change adds a row to `change_log` in the transaction of the change. Renaming card 5 adds:

      {:id 830, :table_name \"report_card\", :row_id 5, :action \"update\", :created_at ...}

  While the feature is on, each write of a tracked model adds one query to its batch of events, and a delete reads
  what it cascades to. While it is off, the consumer runs no query.

  To track a model, give it a spec and derive `:hook/events` next to its other hooks:

      (doto :model/PermissionsGroup
        (derive :metabase/model)
        (derive :hook/entity-id)
        (derive :hook/events))

      (defmethod change-log/spec :model/PermissionsGroup [_model]
        {:track [:name :entity_id :magic_group_type :is_tenant_group]
         :skip  []})

  The [[spec]] lists every column of the table but `:id`, `:created_at` and `:updated_at`: under `:track` the columns
  whose change is logged, and under `:skip` the ones whose change alone logs nothing. A new column fails
  `spec-columns-test` until it is in one of them.

  `metabase.change-log.events` consumes the lifecycle events of the model: it logs each insert, update and delete, once
  per row at the end of the batch of the write. A model whose delete cascades to a tracked table (`ON DELETE CASCADE`,
  or `ON DELETE SET NULL`) also derives `:hook/events`, because the cascade is captured at the delete, before the
  database runs it, and logged with it at any depth. A tracked model needs a primary key of one integer column and a
  namespace that loads at startup: `metabase.change-log.events-test` checks both. The consumer reads the key from the
  row the insert returns, so an insert that picks its returned columns must include the key: `[:model/User :id :email]`,
  not `[:model/User :email]`. Without the key, the insert throws in dev and test. In production it goes ahead, and
  Metabase logs a warning instead of an entry.

  Each model is tracked or not on purpose. A new model fails `tracked-models-test` until it is in `tracked-models` or
  `untracked-models`, the two lists in `metabase.change-log.events-test`, the first being the models with a spec.

  A direct table write skips the model: raw SQL, `t2/query`, `t2/update!` on the table name. It logs its rows with
  [[log-rows!]]. The `:metabase/change-log-raw-write` lint reports such a write when the call names the table. A write
  that needs no entry opts out with an ignore of that lint and its reason.

  Not captured:

  - a model that is not tracked
  - an update that sets only columns that the model's [[spec]] skips: usage stats that reads update (view
    counts, last viewed and last used times), and what sync works out for Metabase's own use, such as a field's
    fingerprint
  - an update that changes no row
  - migrations, and SQL run outside Metabase
  - a direct table write that opted out, or that does not call [[log-rows!]] and that the lint cannot see: a query
    map built outside the call, or a SQL string
  - a row that starts to match an update or a delete after the hook read which rows match
  - any change made while the feature is off

  To read the log, follow `position`:

      SELECT * FROM change_log WHERE position > :cursor ORDER BY position

  - Read again the row each entry names. A missing row was deleted. One change can have more than one entry.
  - Keep the last position you read as your cursor. A new position is always above every position you can see.
  - An entry gets its position about 5 seconds after its change commits, from `metabase.change-log.numbering`.
    Until then it has none. If the change commits more than a minute after it was logged, the entry gets its
    position after the next logged change.
  - Entries are deleted after 30 days. To start, or if your last read was longer ago than that, note the highest
    position, snapshot the tables, and follow from there.

  Do not follow `id`. An entry takes its id when it is written and shows up when its transaction commits, so a lower
  id can show up after a higher one (`ids-out-of-order-test`)."
  (:require
   [metabase.change-log.events]
   [metabase.change-log.log]
   [metabase.change-log.spec]
   [potemkin :as p]))

(comment metabase.change-log.events/keep-me)

(p/import-vars
 [metabase.change-log.log
  log-rows!]
 [metabase.change-log.spec
  spec])
