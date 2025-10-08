(ns metabase-enterprise.representations.v0.transform
  "The v0 transform representation namespace."
  (:require
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defmethod import/type->schema [:v0 :transform] [_]
  ::transform)

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'transform' for this schema"}
   :transform])

(mr/def ::version
  [:enum {:decode/json keyword
          :description "Version of this transform schema"}
   :v0])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the transform, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the transform"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining the transform's purpose"}
   :string])

(mr/def ::query
  [:and
   {:description "SQL query that performs the transformation"}
   ::lib.schema.common/non-blank-string])

(mr/def ::mbql-query
  [:and
   {:description "MBQL (Metabase Query Language) query that performs the transformation"}
   :map])

(mr/def ::database
  [:and
   {:description "Database reference string"}
   ::lib.schema.common/non-blank-string])

(mr/def ::target-table
  [:and
   {:description "Name of the destination table"}
   ::lib.schema.common/non-blank-string])

(mr/def ::target-schema
  [:and
   {:description "Database schema for the target table (e.g., 'public', 'reporting')"}
   ::lib.schema.common/non-blank-string])

(mr/def ::tags
  [:sequential
   {:description "Optional tags for categorizing and organizing transforms"}
   ::lib.schema.common/non-blank-string])

(mr/def ::source
  [:map
   {:description "Source for the transform - either a SQL query or MBQL query"}
   [:query {:optional true} ::query]
   [:mbql_query {:optional true} ::mbql-query]])

(mr/def ::target
  [:map
   {:description "Target table configuration for the transform output"}
   [:table ::target-table]
   [:schema {:optional true} ::target-schema]])

;;; ------------------------------------ Main Schema ------------------------------------

(mr/def ::transform
  [:and
   [:map
    {:description "v0 schema for human-writable transform representation"}
    [:type ::type]
    [:version ::version]
    [:ref ::ref]
    [:name {:optional true} ::name]
    [:description {:optional true} ::description]
    [:database ::database]
    [:source {:optional true} ::source]
    [:target {:optional true} ::target]
    [:target_table {:optional true} ::target]
    [:query {:optional true} ::query]
    [:mbql_query {:optional true} ::mbql-query]
    [:tags {:optional true} ::tags]]
   [:fn {:error/message "Source must have exactly one of :query or :mbql_query"}
    (fn [{:keys [source] :as transform}]
      (or (when source
            (= 1 (count (filter some? [(:query source) (:mbql_query source)]))))
          (= 1 (count (filter some? [(:query transform) (:mbql_query transform)])))))]])

;;; ------------------------------------ Ingestion Functions ------------------------------------

(defn yaml->toucan
  "Convert a validated v0 transform representation into data suitable for creating/updating a Transform."
  [{:keys [database] :as representation}
   ref-index]
  (let [database-id (try
                      (v0-common/ref->id (:database representation) ref-index)
                      (catch Exception e
                        (log/errorf e "Error resolving database ref: %s" database)
                        (t2/select-one-fn :id :model/Database :name database)))
        query (v0-mbql/import-dataset-query representation ref-index)]
    (when-not database-id
      (throw (ex-info (str "Database not found: " database)
                      {:database database})))
    {:entity_id (or (:entity_id representation)
                    (v0-common/generate-entity-id (assoc representation :collection "transforms")))
     :name (:name representation)
     :description (or (:description representation) "")
     :source {:type "query"
              :query query}
     :target {:type "table"
              :schema (-> representation :target_table :schema)
              :name (-> representation :target_table :table)}}))

(defmethod import/yaml->toucan [:v0 :transform]
  [representation ref-index]
  (yaml->toucan representation ref-index))

(defn- set-up-tags [transform-id tags]
  (when (seq tags)
    (let [existing-tags (t2/select :model/TransformTag :name [:in tags])
          missing-tags (reduce disj (set tags) (map :name existing-tags))
          new-tags (t2/insert-returning-instances! :model/TransformTag (for [tag missing-tags] {:name tag}))
          by-name (into {} (map (juxt :name identity)) (concat existing-tags new-tags))]
      (t2/insert! :model/TransformTransformTag (for [[i tag] (map vector (range) tags)]
                                                 {:transform_id transform-id
                                                  :tag_id (-> tag by-name :id)
                                                  :position i})))))

(defmethod import/persist! [:v0 :transform]
  [representation ref-index]
  (let [transform-data (import/yaml->toucan representation ref-index)
        entity-id (:entity_id transform-data)
        existing (when entity-id
                   (t2/select-one :model/Transform :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing transform" (:name transform-data) "with ref" (:ref representation))
        (t2/update! :model/Transform (:id existing) (dissoc transform-data :entity_id))
        (t2/delete! :model/TransformTransformTag :transform_id (:id existing))
        (set-up-tags (:id existing) (:tags representation))
        (t2/hydrate (t2/select-one :model/Transform :id (:id existing)) :transform_tag_names))
      (do
        (log/info "Creating new transform" (:name transform-data))
        (let [transform (t2/insert-returning-instance! :model/Transform transform-data)]
          (set-up-tags (:id transform) (:tags representation))
          (t2/hydrate transform :transform_tag_names))))))

;; EXPORT

(defn ->ref
  "Make a ref"
  [card]
  (format "%s-%s" "transform" (:id card)))

(defn- patch-refs-for-export [query]
  (-> query
      (v0-mbql/->ref-database)
      (v0-mbql/->ref-source-table)
      (v0-mbql/->ref-fields)))

(defmethod export/export-entity :model/Transform [transform]
  (let [query (patch-refs-for-export (-> transform :source :query))]
    (cond-> {:name (:name transform)
             :type :transform
             :version :v0
             :ref (v0-common/unref (v0-common/->ref (:id transform) :transform))
             :description (:description transform)
             :entity_id (:entity_id transform)
             :tags (:tags transform)}

      (#{"native" :native} (:type query))
      (assoc :query (-> query :native :query)
             :database (:database query))

      (#{"query" :query} (:type query))
      (assoc :mbql_query (:query query)
             :database (:database query))

      (#{"table" :table} (-> transform :target :type))
      (assoc :target_table {:schema (-> transform :target :schema)
                            :table (-> transform :target :name)})

      :always
      u/remove-nils)))

(comment
  (t2/hydrate (t2/select-one :model/Transform) :transform_tag_names)
  (t2/select-one :model/TransformTag)
  (def t (t2/hydrate (t2/select-one :model/Transform) :transform_tag_names))
  (def q (-> t :source :query))
  (v0-mbql/->ref-fields q)
  (def i {"database-53" (t2/select-one :model/Database 53)})
  (yaml->toucan (export/export-entity t) i)

  (spit "test_resources/representations/v0/orders-count.transform.yml"
        (-> :model/Transform
            t2/select-one
            (t2/hydrate :transform_tag_names)
            export/export-entity
            rep-yaml/generate-string)))
