(ns metabase.models.raw-table
  (:require [korma.core :as k]
            [metabase.db :as db]
            [metabase.models.interface :as i]
            [metabase.models.raw-column :refer [RawColumn]]
            [metabase.util :as u]))


(i/defentity RawTable :raw_table)

(defn- pre-insert [table]
  (let [defaults {:details {}}]
    (merge defaults table)))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete 'Table :raw_table_id id)
  (db/cascade-delete RawColumn :raw_table_id id))

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
  (db/sel :many RawColumn :raw_table_id id, (k/order :name :ASC)))

(defn active-tables
  "Return the active `RawColumns` belonging to RAW-TABLE."
  [database-id]
  (db/sel :many RawTable :database_id database-id, :active true, (k/order :schema :ASC), (k/order :name :ASC)))

(defn active-columns
  "Return the active `RawColumns` belonging to RAW-TABLE."
  [{:keys [id]}]
  (db/sel :many RawColumn :raw_table_id id, :active true, (k/order :name :ASC)))
