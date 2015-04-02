(ns metabase.models.table
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [database :as db]
                             [field :refer [Field]])
            [metabase.util :as u]))

(def entity-types
  "Valid values for `Table.entity_type` (field may also be `nil`)."
  #{:person :event :photo :place})

(defentity Table
  (table :metabase_table)
  timestamped
  (types {:entity_type :keyword})
  (assoc :hydration-keys #{:table}))


(defmethod post-select Table [_ {:keys [id db db_id description] :as table}]
  (u/assoc* table
               :db          (or db (delay (sel :one db/Database :id db_id)))
               :fields      (delay (sel :many Field :table_id id :active true (order :position :ASC) (order :name :ASC)))
               :description (u/jdbc-clob->str description)
               :pk_field    (delay (:id (sel :one :fields [Field :id] :table_id id (where {:special_type "id"}))))
               :can_read    (delay @(:can_read @(:db <>)))
               :can_write   (delay @(:can_write @(:db <>)))))


(defmethod pre-cascade-delete Table [_ {:keys [id] :as table}]
  (cascade-delete Field :table_id id))
