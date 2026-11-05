(ns metabase.change-log.core
  "The change log tells a reader which rows of some app DB tables changed, so that it can keep a copy of those tables
  without reading them whole. A logged model, one that derives `:hook/change-log`, logs each insert, update and delete
  that Metabase makes to its rows: Metabase adds an entry to the table `change_log`, in the same transaction. Renaming
  card 5 adds:

      {:id 830, :table_name \"report_card\", :row_id 5, :action \"update\", :created_at ...}

  An entry names a row, not its values: a reader reads the row again. The change log is on while the license has the
  `:change-log` feature.

  - A delete through any model, logged or not, also logs the rows of logged tables that the database deletes with it
    (`ON DELETE CASCADE`), as `delete`, and the rows it changes (`ON DELETE SET NULL`), as `update`. It follows foreign
    keys only through logged tables, so it misses a row that the database deletes through a table that is not logged.
    It logs them before the model's before-delete runs. So the rows that a before-delete deletes ahead of the foreign
    keys, such as a Database's cards and fields, are logged too, and twice if it deletes them through their model, as
    a Table does its fields.
  - An update or a delete by condition reads the keys of the rows it matches, then writes. A row that starts to match
    between the read and the write is changed but not logged.
  - A write that bypasses the model logs its rows by hand, with [[log-rows!]]. Each one in Metabase does, except those
    that only update usage stats when a row is read or run: view counts and the last viewed and last used times. Raw
    SQL run outside Metabase and migrations are not logged.
  - While the change log is on, a logged insert runs one more insert, and an update one read and one insert. A delete
    reads its rows and the rows it cascades to, then inserts their entries. While the change log is off, no model runs
    an extra query.
  - The task `metabase.change-log.task.truncate-change-log` deletes the entries older than 30 days, every 12 hours.

  To read the change log:

  1. Read the entries in id order, and read again the row each entry names. Take a missing row as deleted. One change
     can have more than one entry.
  2. Expect ids to commit out of order. An id is given out when a transaction writes, not when it commits. Transaction
     A takes id 850 and stays open, and B takes 851 and commits: a reader sees 851 first, and 850 only once A commits.
     So the highest id read is not a watermark.
  3. When your next unread id is below the smallest id in `change_log`, the truncate task deleted entries you never
     read, and the changes they name are missing.

  To log a model:

  1. Derive `:hook/change-log` in the model's namespace. Its primary key must be one integer column. `row_id` is a
     bigint, so while the change log is on, a model keyed any other way fails its writes or logs a wrong key. An insert
     that names the columns it returns must name the key, as in `[:model/User :id :email]`.
  2. Make sure the model's namespace loads at startup. Metabase may load a model's namespace only when the model is
     first used, and until then a delete that cascades to the model's rows does not log them. If nothing loads it at
     startup, require it from its module's init namespace, as `metabase.pulse.init` does.
  3. Find the writes to its table that bypass the model (raw SQL, `t2/query`, `t2/update!` on the table name). Log the
     rows of each one with [[log-rows!]], unless it only updates usage stats.

  `metabase.change-log.models-test` checks steps 1 and 2 for every logged model."
  (:require
   [metabase.change-log.models]
   [potemkin :as p]))

(comment metabase.change-log.models/keep-me)

(p/import-vars
 [metabase.change-log.models
  log-rows!])
