(ns metabase.models.raw-table
  (:require [metabase.models.raw-column :refer [RawColumn]]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel RawTable :raw_table)

(defn- pre-insert [table]
  (let [defaults {:details {}}]
    (merge defaults table)))

(defn- pre-delete [{:keys [id]}]
  (db/delete! 'Table :raw_table_id id)
  (db/delete! RawColumn :raw_table_id id))

(u/strict-extend (class RawTable)
  models/IModel (merge models/IModelDefaults
                   {:types      (constantly {:details :json})
                    :properties (constantly {:timestamped? true})
                    :pre-insert pre-insert
                    :pre-delete pre-delete}))


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
