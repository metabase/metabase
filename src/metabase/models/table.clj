(ns metabase.models.table
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.database :refer [Database]])
  (:use korma.core))

(defentity Table
  (table :metabase_table))

(defmethod post-select Table [_ {:keys [db_id] :as table}]
  (-> table
      (assoc :database (sel-fn :one Database :id db_id))))
