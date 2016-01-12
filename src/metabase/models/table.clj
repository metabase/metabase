(ns metabase.models.table
  (:require [korma.core :as k]
            [metabase.db :refer [cascade-delete sel]]
            (metabase.models [common :as common]
                             [database :as db]
                             [field :refer [Field]]
                             [field-values :refer [FieldValues]]
                             [interface :as i])
            [metabase.util :as u]))

(def ^:const entity-types
  "Valid values for `Table.entity_type` (field may also be `nil`)."
  #{:person :event :photo :place})

(def ^:const visibility-types
  "Valid values for `Table.visibility_type` (field may also be `nil`)."
  #{:hidden :technical :cruft})


(i/defentity Table :metabase_table)

(defn- post-select [{:keys [id db db_id description] :as table}]
  (u/assoc<> table
    :db           (or db (delay (sel :one db/Database :id db_id)))
    :fields       (delay (sel :many Field :table_id id :active true (k/order :position :ASC) (k/order :name :ASC)))
    :field_values (delay
                   (let [field-ids (sel :many :field [Field :id]
                                        :table_id id
                                        :active true
                                        :field_type [not= "sensitive"]
                                        (k/order :position :asc)
                                        (k/order :name :asc))]
                     (sel :many :field->field [FieldValues :field_id :values] :field_id [in field-ids])))
    :description  (u/jdbc-clob->str description)
    :pk_field     (delay (sel :one :id Field :table_id id (k/where {:special_type "id"})))))

(defn- pre-insert [table]
  (let [defaults {:display_name (common/name->human-readable-name (:name table))}]
    (merge defaults table)))

(defn- pre-cascade-delete [{:keys [id] :as table}]
  (cascade-delete Field :table_id id))

(extend (class Table)
  i/IEntity (merge i/IEntityDefaults
                   {:hydration-keys     (constantly [:table])
                    :types              (constantly {:entity_type :keyword, :visibility_type :keyword})
                    :timestamped?       (constantly true)
                    :post-select        post-select
                    :pre-insert         pre-insert
                    :pre-cascade-delete pre-cascade-delete}))


(u/require-dox-in-this-namespace)
