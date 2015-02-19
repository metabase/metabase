(ns metabase.models.table
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.util :as util]))

(defentity Table
  (table :metabase_table))

(defmethod post-select Table [_ {:keys [id db_id] :as table}]
  (-> table
      (assoc :db (sel-fn :one Database :id db_id))
      (assoc :fields (sel-fn :many "metabase.models.field/Field" :table_id id))))

(defmethod pre-insert Table [_ table]
  (assoc table
         :created_at (util/new-sql-date)
         :updated_at (util/new-sql-date)))
