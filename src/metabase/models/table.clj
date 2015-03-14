(ns metabase.models.table
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [database :as db]
                             [field :refer [Field]])
            [metabase.util :as util]))

(defentity Table
  (table :metabase_table))


(defmethod post-select Table [_ {:keys [id db db_id] :as table}]
  (util/assoc* table
               :db           (or db (delay (sel :one db/Database :id db_id))) ; Check to see if `:db` is already set. In some cases we add a korma transform fn to `Table`
               :fields       (delay (sel :many Field :table_id id))           ; and assoc :db if the DB has already been fetched, so we can re-use its DB connections.
               :can_read     (delay @(:can_read @(:db <>)))
               :can_write    (delay @(:can_write @(:db <>)))))

(defmethod pre-insert Table [_ table]
  (assoc table
         :created_at (util/new-sql-timestamp)
         :updated_at (util/new-sql-timestamp)))

(defmethod pre-cascade-delete Table [_ {:keys [id] :as table}]
  (cascade-delete Field :table_id id))
