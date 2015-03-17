(ns metabase.models.table
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [database :as db]
                             [field :refer [Field]])
            [metabase.util :as u]))

(defentity Table
  (table :metabase_table))


(defmethod post-select Table [_ {:keys [id db db_id description] :as table}]
  (u/assoc* table
               :db          (or db (delay (sel :one db/Database :id db_id))) ; Check to see if `:db` is already set. In some cases we add a korma transform fn to `Table`
               :fields      (delay (sel :many Field :table_id id))           ; and assoc :db if the DB has already been fetched, so we can re-use its DB connections.
               :description (u/jdbc-clob->str description)
               :pk_field    (delay (:id (sel :one :fields [Field :id] :table_id id (where {:special_type "id"}))))
               :can_read    (delay @(:can_read @(:db <>)))
               :can_write   (delay @(:can_write @(:db <>)))))

(defmethod pre-insert Table [_ table]
  (assoc table
         :created_at (u/new-sql-timestamp)
         :updated_at (u/new-sql-timestamp)))

(defmethod pre-cascade-delete Table [_ {:keys [id] :as table}]
  (cascade-delete Field :table_id id))
