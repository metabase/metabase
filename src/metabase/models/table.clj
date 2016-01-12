(ns metabase.models.table
  (:require [korma.core :as k]
            [metabase.db :as db]
            (metabase.models [common :as common]
                             [database :as database]
                             [field :refer [Field]]
                             [field-values :refer [FieldValues]]
                             [interface :as i]
                             [metric :refer [Metric retrieve-metrics]]
                             [segment :refer [Segment retrieve-segments]])
            [metabase.util :as u]))

(def ^:const entity-types
  "Valid values for `Table.entity_type` (field may also be `nil`)."
  #{:person :event :photo :place})

(def ^:const visibility-types
  "Valid values for `Table.visibility_type` (field may also be `nil`)."
  #{:hidden :technical :cruft})

(i/defentity Table :metabase_table)

(defn ^:hydrate metrics
  "Retrieve the metrics for TABLE."
  [{:keys [id]}]
  (retrieve-metrics id :all))

(defn ^:hydrate segments
  "Retrieve the segments for TABLE."
  [{:keys [id]}]
  (retrieve-segments id :all))

(defn- pre-insert [table]
  (let [defaults {:display_name (common/name->human-readable-name (:name table))}]
    (merge defaults table)))

(defn- pre-cascade-delete [{:keys [id] :as table}]
  (db/cascade-delete Segment :table_id id)
  (db/cascade-delete Metric :table_id id)
  (db/cascade-delete Field :table_id id))

(defn- ^:hydrate fields [{:keys [id]}]
  (sel :many Field :table_id id, :active true, (k/order :position :ASC) (k/order :name :ASC)))

(defn- field-values
  {:hydrate :field_values}
  [{:keys [id]}]
  (let [field-ids (sel :many :id Field, :table_id id, :active true, :field_type [not= "sensitive"]
                       (k/order :position :asc)
                       (k/order :name :asc))]
    (sel :many :field->field [FieldValues :field_id :values] :field_id [in field-ids])))

(defn- pk-field-id
  {:hydrate :pk_field}
  [{:keys [id]}]
  (sel :one :id Field, :table_id id, :special_type "id"))

(extend (class Table)
  i/IEntity (merge i/IEntityDefaults
                   {:hydration-keys     (constantly [:table])
                    :types              (constantly {:entity_type :keyword, :visibility_type :keyword, :description :clob})
                    :timestamped?       (constantly true)
                    :pre-insert         pre-insert
                    :pre-cascade-delete pre-cascade-delete
                    :database           (comp db/Database :db_id)}))


;; ## Persistence Functions

(defn table-id->database-id
  "Retrieve the `Database` ID for the given table-id."
  [table-id]
  {:pre [(integer? table-id)]}
  (db/sel :one :field [Table :db_id] :id table-id))


(u/require-dox-in-this-namespace)
