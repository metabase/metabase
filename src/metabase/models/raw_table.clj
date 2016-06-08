(ns metabase.models.raw-table
  (:require [metabase.db :as db]
            [metabase.models.interface :as i]
            [metabase.models.raw-column :refer [RawColumn]]
            [metabase.util :as u]))


(i/defentity RawTable :raw_table)

(defn- pre-insert [table]
  (let [defaults {:details {}}]
    (merge defaults table)))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete! 'Table :raw_table_id id)
  (db/cascade-delete! RawColumn :raw_table_id id))

(u/strict-extend (class RawTable)
  i/IEntity (merge i/IEntityDefaults
                   {:types              (constantly {:details :json})
                    :timestamped?       (constantly true)
                    :pre-insert         pre-insert
                    :pre-cascade-delete pre-cascade-delete}))


;;; ## ---------------------------------------- PERSISTENCE FUNCTIONS ----------------------------------------


(defn ^:hydrate columns
  "Return the `RawColumns` belonging to RAW-TABLE."
  [{:keys [id]}]
  (db/select RawColumn, :raw_table_id id, {:order-by [[:name :asc]]}))

(defn active-tables
  "Return the active `RawColumns` belonging to RAW-TABLE."
  [database-id]
  (db/select RawTable, :database_id database-id, :active true, {:order-by [[:schema :asc]
                                                                           [:name :asc]]}))

(defn active-columns
  "Return the active `RawColumns` belonging to RAW-TABLE."
  [{:keys [id]}]
  (db/select RawColumn, :raw_table_id id, :active true, {:order-by [[:name :asc]]}))
