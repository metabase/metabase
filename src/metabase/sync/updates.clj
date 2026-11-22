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
   [metabase.warehouse-schema.user-settings :as warehouse-schema.user-settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- stored-option
  "The option of a bulk update of `row`, an instance of `model` sync holds or its id, under `k`: the instance as the row
  before the update, so that the update reads none, or nil for an id."
  [model k row]
  (when (t2/instance-of? model row)
    {k [row]}))

(defn set-initial-table-sync-complete!
  "Marks initial sync as complete for this table so that it becomes usable in the UI, if not already set"
  [table]
  (when (not= (:initial_sync_status table) "complete")
    (table/update-tables! [{:id (u/the-id table) :initial_sync_status "complete"}]
                          (stored-option :model/Table :tables table))))

(defn set-initial-table-sync-complete-for-db!
  "Marks initial sync for all tables in `db` as complete so that it becomes usable in the UI, if not already
  set."
  [database]
  (let [ids (sync.db/sync-table-ids (u/the-id database))]
    (reduce (fn [acc ids']
              (+ acc (count (table/update-tables! (mapv (fn [id] {:id id :initial_sync_status "complete"}) (distinct ids'))))))
            0
            (partition-all sync-util/*batch-size* ids))))

(mu/defn update-field-unless-user-set! :- ms/IntGreaterThanOrEqualToZero
  "Apply to `field`, the Field or its id, the `changes` to columns no user set, returning the number updated."
  [field   :- [:or ::lib.schema.id/field (ms/InstanceOf :model/Field)]
   changes :- ::warehouse-schema.schema/field.update]
  (let [changes (apply dissoc changes (warehouse-schema.user-settings/user-set-field-columns
                                       (sync.db/field-user-settings (u/the-id field))))]
    (if (seq changes)
      (count (field/update-fields! [(assoc changes :id (u/the-id field))] (stored-option :model/Field :fields field)))
      0)))

(mu/defn update-fields-unless-user-set! :- ms/IntGreaterThanOrEqualToZero
  "Apply to each of `pairs`, a Field instance sync holds and its changes, the changes to columns no user set, in one
  bulk update, the settings of the Fields read once, returning the number of Fields updated."
  [pairs :- [:sequential [:tuple (ms/InstanceOf :model/Field) ::warehouse-schema.schema/field.update]]]
  (let [settings (u/index-by :field_id (sync.db/field-user-settings-for-fields (mapv (comp :id first) pairs)))
        rows     (into []
                       (keep (fn [[field changes]]
                               (let [changes (apply dissoc changes (warehouse-schema.user-settings/user-set-field-columns
                                                                    (settings (:id field))))]
                                 (when (seq changes)
                                   (assoc changes :id (:id field))))))
                       pairs)]
    (count (field/update-fields! rows {:fields (mapv first pairs)}))))

(mu/defn update-table-unless-user-set! :- ms/IntGreaterThanOrEqualToZero
  "Apply to `table`, the Table or its id, the `changes` to columns no user set, returning the number updated."
  [table   :- [:or ::lib.schema.id/table (ms/InstanceOf :model/Table)]
   changes :- ::warehouse-schema.schema/table.update]
  (let [changes (apply dissoc changes (warehouse-schema.user-settings/user-set-table-columns
                                       (sync.db/table-user-settings (u/the-id table))))]
    (if (seq changes)
      (count (table/update-tables! [(assoc changes :id (u/the-id table))] (stored-option :model/Table :tables table)))
      0)))
