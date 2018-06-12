(ns metabase.schema
  "Contains custom resolvers and a function to provide the full schema."
  (:require
   [cheshire.core :as json]
   [clojure.tools.logging :as log]
   [clojure.java.io :as io]
   [com.walmartlabs.lacinia
    [executor :as executor]
    [schema :as schema]
    [util :as util]]
   [clojure.edn :as edn]
   [metabase.models
    [database :refer [Database]]
    [field :refer [Field]]
    [metric :refer [Metric]]
    [segment :refer [Segment]]
    [table :refer [Table]]]
   [toucan
    [db :as db]
    [hydrate :refer [hydrate]]]))

;; only required when the GraphQL field name doesn't match the database field name
(def hydrate-mapping
  {:Table/database :db
   :Field/target   :fk_target_field})

(defn selections-tree->hydration-list
  "Transforms a Lacinia selections-tree into a Toucan hydration list"
  [selections-tree]
  (for [[gql-field sub-fields] selections-tree
        :let [field (get hydrate-mapping gql-field (keyword (name gql-field)))]]
    (if sub-fields
      (cons field (selections-tree->hydration-list (:selections sub-fields)))
      field)))

(defn resolve-with-hydration
  "Runs a query with hydration pulled from context"
  [context query]
  (let [hydrate-list (selections-tree->hydration-list (executor/selections-tree context))]
    (if (empty? hydrate-list)
      query
      (apply hydrate (cons query hydrate-list)))))

(defn list-resolver
  "Create a resolver that lists all objects of a particular model"
  [Model]
  (fn [context arg value]
    (resolve-with-hydration context (db/select Model))))

(defn by-id-
  "Create a resolver that gets a single item by id"
  [Model]
  (fn [context {:keys [id]} value]
    (resolve-with-hydration context (Model id))))

(defn object-list-resolver
  "Create a resolver for list of objects belonging to another object"
  [Model property id-property]
  (fn [context args value]
    ;; check if already hydrated
    (if (contains? value property)
      (get value property)
      (resolve-with-hydration context (db/select Model, id-property (:id value))))))

(defn object-child-resolver
  "Create a resolver for a single oject belonging to another object"
  [Model property id-property]
  (fn [context args value]
    ;; check if already hydrated
    (if (contains? value property)
      (get value property)
      (resolve-with-hydration context (Model (get value id-property))))))

(defn resolver-map
  "Create a mapping of resolvers"
  []
  {:query/databases      (list-resolver Database)
   :query/tables         (list-resolver Table)
   :query/fields         (list-resolver Field)
   :query/database-by-id (by-id-resolver Database)
   :query/table-by-id    (by-id-resolver Table)
   :query/field-by-id    (by-id-resolver Field)
   :Database/tables      (object-list-resolver Table :tables :db_id)
   :Table/fields         (object-list-resolver Field :fields :table_id)
   :Table/metrics        (object-list-resolver Metric :metrics :table_id)
   :Table/segments       (object-list-resolver Segment :segments :table_id)
   :Table/database       (object-child-resolver Database :db :db_id)
   :Segment/table        (object-child-resolver Table :table :table_id)
   :Metric/table         (object-child-resolver Table :table :table_id)
   :Field/table          (object-child-resolver Table :table :table_id)
   :Field/target         (object-child-resolver Field :target :fk_target_field_id)})

(defn scalar-transformers-map
  []
  {:json-parse (schema/as-conformer #(identity %))
   :json-serialize (schema/as-conformer #(identity %))})

(defn load-schema
  "Loads the schema from resources and attaches resolvers"
  []
  (-> (io/resource "metabase-schema.edn")
      slurp
      edn/read-string
      (util/attach-resolvers (resolver-map))
      (util/attach-scalar-transformers (scalar-transformers-map))
      schema/compile))
