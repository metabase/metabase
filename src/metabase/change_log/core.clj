(ns metabase.change-log.core
  "The change log: the table `change_log` names each row that Metabase's models insert, update or delete in a logged
  table, the table of a model that derives `:hook/change-log`. The change log is on while the setting
  `change-log-enabled` is on and Metabase is hosted or its licence has `:audit-app` ([[enabled?]]).

  - An entry has `id`, `table_name`, `row_id` (the row's primary key), `action` (`insert`, `update` or `delete`) and
    `created_at`. It names a row, not its values.
  - An entry commits in the transaction of the write it names.
  - A delete through any model, logged or not, also logs the rows of logged tables that the database deletes with it
    (`ON DELETE CASCADE`), as `delete`, and the rows it changes (`ON DELETE SET NULL`), as `update`.
  - A write that bypasses the models, such as raw SQL or a migration, is not logged unless it calls [[log-rows!]].
    Metabase does not log `view_count`, `last_viewed_at` and `last_used_at`, which it updates in raw SQL on every view
    or run.
  - While the change log is on, a logged insert runs one more insert, and an update one read and one insert. A delete
    reads its rows and the rows it cascades to, then inserts their entries. While the change log is off, no model runs
    an extra query.
  - An entry with `action` `start` (`table_name` `*`, `row_id` 0) is a start marker. The change log was off for a time
    before it, so the changes made then are missing. Only a full read of the logged tables brings a copy up to date. One
    turn-on can write a start marker on each node.
  - The task `metabase.change-log.task.cleanup` deletes the entries older than `change-log-retention-days` (30 by
    default), every hour.

  To read the change log:

  1. Call [[turn-on!]] at each run. Never turn the change log off: other readers may follow it.
  2. Read the entries in id order, and read again the row each entry names. Take a missing row as deleted.
  3. Ids are given out as transactions write, not as they commit. So an id can commit after a higher one, as late as the
     end of its transaction. Keep reading a missing id for longer than the longest transaction that writes a logged
     table. Metabase Monitor waits 120 s for a missing id, then still reads it again for an hour.
  4. Let W be the highest id up to which you read, or stopped waiting for, every id. When the smallest id in
     `change_log` is above W + 1, the cleanup task deleted entries you never read, and the changes they name are
     missing.

  To log a model:

  1. Derive `:hook/change-log` in the model's namespace. Its primary key must be one integer column. `row_id` is a
     bigint, so while the change log is on, a model keyed any other way fails its writes or logs a wrong key.
  2. Make sure the model's namespace has loaded before a delete can cascade to its table. Metabase may load a model's
     namespace only when the model is first used, and the change log sees only the models whose namespaces have loaded.
     Require it from its module's init namespace, or from the namespace of the model whose deletes cascade to it, as
     `metabase.pulse.models.pulse-channel` does for `metabase.pulse.models.pulse-channel-recipient`.
  3. Find the writes to its table that bypass the model (raw SQL, `t2/query`, `t2/update!` on the table name), and log
     each with [[log-rows!]].

  `metabase.change-log.models-test` checks step 1 for every logged model."
  (:require
   [metabase.change-log.models]
   [metabase.change-log.settings]
   [potemkin :as p]))

(comment metabase.change-log.models/keep-me
         metabase.change-log.settings/keep-me)

(p/import-vars
 [metabase.change-log.models
  enabled?
  log-rows!
  turn-on!]
 [metabase.change-log.settings
  change-log-enabled])
