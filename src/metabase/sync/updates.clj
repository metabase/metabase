(ns metabase.sync.updates
  "The updates sync makes to Tables and Fields beyond their metadata: the columns no user set, and the status of the
  initial sync of each Table."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.user-settings :as warehouse-schema.user-settings]))

(set! *warn-on-reflection* true)

(defn set-initial-table-sync-complete!
  "Marks initial sync as complete for this table so that it becomes usable in the UI, if not already set"
  [table]
  (when (not= (:initial_sync_status table) "complete")
    (table/update-table! (u/the-id table) {:initial_sync_status "complete"})))

(defn set-initial-table-sync-complete-for-db!
  "Marks initial sync for all tables in `db` as complete so that it becomes usable in the UI, if not already
  set."
  [database]
  (let [ids (sync.db/sync-table-ids (u/the-id database))]
    (reduce (fn [acc ids']
              (+ acc (table/update-tables-with-changes! (set ids') {:initial_sync_status "complete"})))
            0
            (partition-all sync-util/*batch-size* ids))))

(mu/defn update-field-unless-user-set! :- ms/IntGreaterThanOrEqualToZero
  "Apply to the Field with `field-id` the `changes` to columns no user set, returning the number updated."
  [field-id :- ::lib.schema.id/field
   changes  :- ::warehouse-schema.schema/field.update]
  (let [changes (apply dissoc changes (warehouse-schema.user-settings/user-set-field-columns
                                       (sync.db/field-user-settings field-id)))]
    (if (seq changes)
      (field/update-field! field-id changes)
      0)))

(mu/defn update-table-unless-user-set! :- ms/IntGreaterThanOrEqualToZero
  "Apply to the Table with `table-id` the `changes` to columns no user set, returning the number updated."
  [table-id :- ::lib.schema.id/table
   changes  :- ::warehouse-schema.schema/table.update]
  (let [changes (apply dissoc changes (warehouse-schema.user-settings/user-set-table-columns
                                       (sync.db/table-user-settings table-id)))]
    (if (seq changes)
      (table/update-table! table-id changes)
      0)))
