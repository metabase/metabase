(ns metabase.change-log.core
  "Log which rows changed in some app DB tables so that a reader can incrementally synchronize them.

  Each change adds a row to `change_log` in the transaction of the change. Renaming card 5 adds:

      {:id 830, :table_name \"report_card\", :row_id 5, :action \"update\", :created_at ...}

  The log is on while the license has the `:change-log` feature. While it is on, an insert runs one more query, an
  update two, and a delete two plus the reads of what it cascades to. While it is off, a write runs no extra query.

  To log a model, derive the hook next to its other hooks:

      (doto :model/PermissionsGroup
        (derive :metabase/model)
        (derive :hook/entity-id)
        (derive :hook/change-log))

  This logs each insert, update and delete through the model. A delete of any model also logs the rows of logged
  tables that the database deletes (`ON DELETE CASCADE`) or updates (`ON DELETE SET NULL`) with it, at any depth. The
  model needs a primary key of one integer column and a namespace that loads at startup: `metabase.change-log.hooks-test`
  check both. The insert hook reads the key from the rows the insert returns, so an insert that picks its returned columns
  must include the key: `[:model/User :id :email]`, not `[:model/User :email]`. Without the key, the insert goes ahead
  and Metabase logs a warning instead of an entry.

  A write that skips the model (raw SQL, `t2/query`, `t2/update!` on the table name) logs its rows with [[log-rows!]].

  Not logged:

  - usage stats that reads update: view counts, last viewed and last used times
  - migrations, and SQL run outside Metabase
  - a row that starts to match an update or a delete after the hook read which rows match
  - any change made while the log is off

  To read the log, follow `position`:

      SELECT * FROM change_log WHERE position > :cursor ORDER BY position

  - Read again the row each entry names. A missing row was deleted. One change can have more than one entry.
  - Keep the last position you read as your cursor. A new position is always above every position you can see.
  - An entry gets its position about 5 seconds after its change commits, from the task
    `metabase.change-log.task.number-change-log`. Until then it has none.
  - Entries are deleted after 30 days. To start, or if your last read was longer ago than that, note the highest
    position, read the tables whole, and follow from there.

  Do not follow `id`. An entry takes its id when it is written and shows up when its transaction commits, so a lower
  id can show up after a higher one (`ids-out-of-order-test`)."
  (:require
   [metabase.change-log.hooks]
   [potemkin :as p]))

(comment metabase.change-log.hooks/keep-me)

(p/import-vars
 [metabase.change-log.hooks
  log-rows!])
