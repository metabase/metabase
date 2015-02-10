(ns metabase.models.table
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.database :refer [Database]])
  (:use korma.core))

(defentity Table
  (table :metabase_table))

(defmethod post-select Table [_ {:keys [id db_id] :as table}]
  (-> table
      (assoc :database (sel-fn :one Database :id db_id))
      (assoc :fields (sel-fn :many "metabase.models.field/Field" :table_id id))))
