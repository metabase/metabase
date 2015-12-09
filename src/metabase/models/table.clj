(ns metabase.models.table
  (:require [korma.core :as k, :exclude [defentity update]]
            [metabase.db :as db]
            (metabase.models [common :refer :all]
                             [database :as database]
                             [field :refer [Field]]
                             [field-values :refer [FieldValues]]
                             [interface :refer :all]
                             [segment :refer [Segment retrieve-segments]])
            [metabase.util :as u]))

(def ^:const entity-types
  "Valid values for `Table.entity_type` (field may also be `nil`)."
  #{:person :event :photo :place})

(def ^:const visibility-types
"Valid values for `Table.visibility_type` (field may also be `nil`)."
#{:hidden :technical :cruft})

(defrecord TableInstance []
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite TableInstance :read :always, :write :superuser)

(defentity Table
  [(k/table :metabase_table)
   (hydration-keys table)
   (types :entity_type :keyword, :visibility_type :keyword)
   timestamped]

  (post-select [_ {:keys [id db db_id description] :as table}]
    (map->TableInstance
     (assoc table
       :db                  (or db (delay (db/sel :one database/Database :id db_id)))
       :description         (u/jdbc-clob->str description)
       :fields              (delay (db/sel :many Field :table_id id :active true (k/order :position :ASC) (k/order :name :ASC)))
       :field_values        (delay
                             (let [field-ids (db/sel :many :field [Field :id]
                                                  :table_id id
                                                  :active true
                                                  :field_type [not= "sensitive"]
                                                  (k/order :position :asc)
                                                  (k/order :name :asc))]
                               (db/sel :many :field->field [FieldValues :field_id :values] :field_id [in field-ids])))
       :pk_field            (delay (:id (db/sel :one :fields [Field :id] :table_id id (k/where {:special_type "id"}))))
       :segments            (delay (retrieve-segments id)))))

  (pre-insert [_ table]
    (let [defaults {:display_name (name->human-readable-name (:name table))}]
      (merge defaults table)))

  (pre-cascade-delete [_ {:keys [id] :as table}]
    (db/cascade-delete Segment :table_id id)
    (db/cascade-delete Field :table_id id)))

(extend-ICanReadWrite TableEntity :read :always, :write :superuser)


;; ## Persistence Functions

(defn table-id->database-id
  "Retrieve the `Database` ID for the given table-id."
  [table-id]
  {:pre [(integer? table-id)]}
  (db/sel :one :field [Table :db_id] :id table-id))
