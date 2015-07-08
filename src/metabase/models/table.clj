(ns metabase.models.table
  (:require [korma.core :refer :all, :exclude [defentity]]
            [metabase.db :refer :all]
            (metabase.models [common :as common]
                             [database :as db]
                             [field :refer [Field]]
                             [field-values :refer [FieldValues]]
                             [interface :refer :all])
            [metabase.util :as u]))

(def ^:const entity-types
  "Valid values for `Table.entity_type` (field may also be `nil`)."
  #{:person :event :photo :place})

(defrecord TableInstance []
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite TableInstance :read :always, :write :superuser)

(defentity Table
  [(table :metabase_table)
   (hydration-keys table)
   (types :entity_type :keyword)
   timestamped]

  (post-select [_ {:keys [id db db_id description] :as table}]
    (map->TableInstance
     (u/assoc* table
       :db                  (or db (delay (sel :one db/Database :id db_id)))
       :fields              (delay (sel :many Field :table_id id :active true (order :position :ASC) (order :name :ASC)))
       :field_values        (delay
                             (let [field-ids (sel :many :field [Field :id]
                                                  :table_id id
                                                  :active true
                                                  :field_type [not= "sensitive"]
                                                  (order :position :asc)
                                                  (order :name :asc))]
                               (sel :many :field->field [FieldValues :field_id :values] :field_id [in field-ids])))
       :description         (u/jdbc-clob->str description)
       :pk_field            (delay (:id (sel :one :fields [Field :id] :table_id id (where {:special_type "id"}))))
       :human_readable_name (when (:name table)
                              (delay (common/name->human-readable-name (:name table)))))))

  (pre-cascade-delete [_ {:keys [id] :as table}]
    (cascade-delete Field :table_id id)))

(extend-ICanReadWrite TableEntity :read :always, :write :superuser)
