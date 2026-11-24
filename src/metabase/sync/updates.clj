(ns metabase.sync.updates
  "The updates sync makes to Tables and Fields beyond their metadata: the columns no user set, and the status of the
  initial sync of each Table."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.user-settings :as warehouse-schema.user-settings]
   [metabase.warehouses.models.database :as database]
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
    (table/update-tables! [{:id (u/the-id table) :initial_sync_status "complete"}])))

(defn update-fields!
  "Apply the Field update `rows` with `opts` through [[field/update-fields!]] in a transaction that first locks their
  Databases, as a Database delete does, so that sync never holds some of its Fields while waiting for that delete."
  ([rows]
   (update-fields! rows nil))
  ([rows opts]
   (let [rows (vec rows)]
     (database/call-locking-databases #(when (seq rows) (sync.db/database-ids-of-fields (mapv :id rows)))
                                      #(field/update-fields! rows opts)))))

(defn create-fields!
  "Insert the Field `rows` through [[field/create-fields!]] in a transaction that first locks their Databases, returning
  the inserted Fields."
  [rows]
  (let [rows (vec rows)]
    (database/call-locking-databases
     #(when (seq rows) (sync.db/database-ids-of-tables (into [] (comp (keep :table_id) (distinct)) rows)))
     #(field/create-fields! rows))))

(defn save-field-values-changes!
  "Write `changes` of the FieldValues of the Fields with `field-ids` through [[field-values/save-field-values-changes!]]
  in a transaction that first locks their Databases."
  [field-ids changes]
  (database/call-locking-databases #(when (seq field-ids) (sync.db/database-ids-of-fields (vec field-ids)))
                                   #(field-values/save-field-values-changes! changes)))

(defn- update-fields-counted!
  "Apply the Field update `rows` with `opts` and return their number."
  [rows opts]
  (update-fields! rows opts)
  (count rows))

(defn- update-tables-counted!
  "Apply the Table update `rows` and return their number."
  [rows]
  (table/update-tables! (vec rows))
  (count rows))

(defn set-initial-table-sync-complete-for-db!
  "Marks initial sync for all tables in `db` as complete so that it becomes usable in the UI, if not already set,
  returning the number of Tables updated."
  [database]
  (update-tables-counted! (for [id (distinct (sync.db/sync-table-ids (u/the-id database)))]
                            {:id id :initial_sync_status "complete"})))

(defn- field-rows-unless-user-set
  "The update rows of `id->changes`, a map from Field id to changes, without the columns a user set, by the `settings`
  of the Fields, `{field-id settings}`, leaving out the rows left with no change."
  [settings id->changes]
  (into []
        (keep (fn [[id changes]]
                (let [changes (apply dissoc changes (warehouse-schema.user-settings/user-set-field-columns (settings id)))]
                  (when (seq changes)
                    (assoc changes :id id)))))
        id->changes))

(defn- table-rows-unless-user-set
  "The update rows of `id->changes`, a map from Table id to changes, without the columns a user set, by the `settings`
  of the Tables, `{table-id settings}`, leaving out the rows left with no change."
  [settings id->changes]
  (into []
        (keep (fn [[id changes]]
                (let [changes (apply dissoc changes (warehouse-schema.user-settings/user-set-table-columns (settings id)))]
                  (when (seq changes)
                    (assoc changes :id id)))))
        id->changes))

(mu/defn update-field-unless-user-set! :- ms/IntGreaterThanOrEqualToZero
  "Apply to `field`, the Field or its id, the `changes` to columns no user set, returning the number updated."
  [field   :- [:or ::lib.schema.id/field (ms/InstanceOf :model/Field)]
   changes :- (mut/dissoc ::warehouse-schema.schema/field.update :id)]
  (let [id (u/the-id field)]
    (update-fields-counted! (field-rows-unless-user-set {id (sync.db/field-user-settings id)} {id changes})
                            (stored-option :model/Field :fields field))))

(mu/defn update-fields-unless-user-set! :- ms/IntGreaterThanOrEqualToZero
  "Apply to each of `pairs`, a Field instance sync holds and its changes, the changes to columns no user set, in one
  update with the Fields sync holds as the rows before it, the settings of the Fields read once, returning the number of
  Fields updated."
  [pairs :- [:sequential [:tuple (ms/InstanceOf :model/Field) (mut/dissoc ::warehouse-schema.schema/field.update :id)]]]
  (let [settings (u/index-by :field_id (sync.db/field-user-settings-for-fields (mapv (comp :id first) pairs)))]
    (update-fields-counted! (field-rows-unless-user-set settings (map (fn [[field changes]] [(:id field) changes]) pairs))
                            {:fields (mapv first pairs)})))

(mu/defn update-fields-by-id-unless-user-set! :- ms/IntGreaterThanOrEqualToZero
  "Apply to each Field of `id->changes` its changes to columns no user set, in one update: the settings of the Fields
  are read once and their rows once per batch of the update, returning the number of Fields updated."
  [id->changes :- [:map-of ::lib.schema.id/field (mut/dissoc ::warehouse-schema.schema/field.update :id)]]
  (let [settings (u/index-by :field_id (sync.db/field-user-settings-for-fields (vec (keys id->changes))))]
    (update-fields-counted! (field-rows-unless-user-set settings id->changes) nil)))

(mu/defn update-tables-unless-user-set! :- ms/IntGreaterThanOrEqualToZero
  "Apply to each of `pairs`, a Table instance sync holds and its changes, the changes to columns no user set, in one
  update, the settings of the Tables read once, returning the number of Tables updated."
  [pairs :- [:sequential [:tuple (ms/InstanceOf :model/Table) (mut/dissoc ::warehouse-schema.schema/table.update :id)]]]
  (let [settings (u/index-by :table_id (sync.db/table-user-settings-for-tables (mapv (comp :id first) pairs)))]
    (update-tables-counted! (table-rows-unless-user-set settings (map (fn [[table changes]] [(:id table) changes]) pairs)))))

(mu/defn update-table-unless-user-set! :- ms/IntGreaterThanOrEqualToZero
  "Apply to `table`, the Table or its id, the `changes` to columns no user set, returning the number updated."
  [table   :- [:or ::lib.schema.id/table (ms/InstanceOf :model/Table)]
   changes :- (mut/dissoc ::warehouse-schema.schema/table.update :id)]
  (let [id (u/the-id table)]
    (update-tables-counted! (table-rows-unless-user-set {id (sync.db/table-user-settings id)} {id changes}))))
