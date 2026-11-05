(ns metabase.change-log.core
  "The change log. When a model that derives `:hook/change-log` inserts, updates or deletes a row, Metabase adds an
  entry to the table `change_log`, in the same transaction. Renaming card 5 adds:

      {:id 830, :table_name \"report_card\", :row_id 5, :action \"update\", :created_at ...}

  An entry names a row, not its values: a reader reads the row again. The only reader today is the Metabase Monitor
  relay (`metabase-enterprise.monitor-relay`). Metabase logs while the license has the `:change-log` feature
  ([[enabled?]]).

  - A delete through any model, logged or not, also logs the rows of logged tables that the database deletes with it
    (`ON DELETE CASCADE`), as `delete`, and the rows it changes (`ON DELETE SET NULL`), as `update`. It follows foreign
    keys only through logged tables, so it misses a row that the database deletes through a table that is not logged.
  - An update or a delete by condition reads the keys of the rows it matches, then writes. A row that starts to match
    between the read and the write is changed but not logged.
  - A write that bypasses the models is logged only when it runs through [[log-write!]]. Metabase does so for each
    such write that changes a column the relay's queries read (`metabase-enterprise.monitor-relay.sql`). It leaves
    out, on purpose, the view counts, the last viewed and last used times, the Metabot link columns of `report_card`,
    `tenant.is_active`, and the REPL reset of the classifier's `data_sensitivity`. Raw SQL run outside Metabase and
    migrations are not logged.
  - While the change log is on, a logged insert runs one more insert, and an update one read and one insert. A delete
    reads its rows and the rows it cascades to, then inserts their entries. While the change log is off, no model runs
    an extra query.
  - The task `metabase.change-log.task.cleanup` deletes the entries older than 30 days, every 12 hours.

  To read the change log:

  1. Read the entries in id order, and read again the row each entry names. Take a missing row as deleted.
  2. Expect ids to commit out of order. An id is given out when a transaction writes, not when it commits. Transaction
     A takes id 850 and stays open, and B takes 851 and commits: a reader sees 851 first, and 850 only once A commits.
     So the highest id read is not a watermark.
  3. When your next unread id is below the smallest id in `change_log`, the cleanup task deleted entries you never
     read, and the changes they name are missing.

  To log a model:

  1. Derive `:hook/change-log` in the model's namespace. Its primary key must be one integer column. `row_id` is a
     bigint, so while the change log is on, a model keyed any other way fails its writes or logs a wrong key. An insert
     that names the columns it returns must name the key.
  2. Make sure the model's namespace loads at startup. The change log sees only the models whose namespaces have
     loaded, and Metabase may load a model's namespace only when the model is first used. Require it from its module's
     init namespace, or from the namespace of the model whose deletes cascade to it, as
     `metabase.pulse.models.pulse-channel` does for `metabase.pulse.models.pulse-channel-recipient`.
  3. Find the writes to its table that bypass the model (raw SQL, `t2/query`, `t2/update!` on the table name). Log each
     one that changes a column the relay's queries read with [[log-write!]].

  `metabase.change-log.models-test` checks steps 1 and 2 for every logged model."
  (:require
   [metabase.change-log.models]
   [potemkin :as p]))

(comment metabase.change-log.models/keep-me)

(p/import-vars
 [metabase.change-log.models
  enabled?
  log-write!])
