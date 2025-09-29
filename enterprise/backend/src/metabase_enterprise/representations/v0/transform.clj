(ns metabase-enterprise.representations.v0.transform
  "The v0 transform representation namespace."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.core :as m]
   [malli.error :as me]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'transform' for this schema"}
   :v0/transform])

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
   ::lib.schema.common/non-blank-string])

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
   {:description "Name of the source/target database"}
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
    [:ref ::ref]
    [:name {:optional true} ::name]
    [:description {:optional true} ::description]
    [:database ::database]
    [:source ::source]
    [:target ::target]
    [:query {:optional true} ::query]
    [:mbql_query {:optional true} ::mbql-query]
    [:tags {:optional true} ::tags]]
   [:fn {:error/message "Source must have exactly one of :query or :mbql_query"}
    (fn [{:keys [source]}]
      (= 1 (count (filter some? [(:query source) (:mbql_query source)]))))]])

;;; ------------------------------------ Ingestion Functions ------------------------------------

(defn yaml->toucan
  "Convert a validated v0 transform representation into data suitable for creating/updating a Transform."
  [{:keys [ref name description database source target] :as representation}
   ref-index]
  (let [database-id (v0-common/ref->id database ref-index)
        ;; TODO: better method for persistent entity IDs
        entity-id (v0-common/generate-entity-id (assoc representation :collection "transforms"))]
    (when-not database-id
      (throw (ex-info (str "Database not found: " database)
                      {:database database})))
    {:entity_id entity-id
     :name name
     :description (or description "")
     :source {:type "query"
              :query (merge
                      {:database database-id}
                      (cond
                        (:query source)
                        {:type "native"
                         :native {:query (:query source)
                                  :template-tags {}}}

                        (:mbql_query source)
                        (assoc (:mbql_query source) :database database-id)

                        :else
                        (throw (ex-info "Source must have either 'query' or 'mbql_query'"
                                        {:source source}))))}
     :target {:type "table"
              :schema (:schema target)
              :name (:table target)}}))

(defn persist!
  "Ingest a v0 transform representation and create or update a Transform in the database.

   For POC: Uses ref as a stable identifier for upserts.
   If a transform with the same ref exists (via entity_id), it will be updated.
   Otherwise a new transform will be created.

   Returns the created/updated Transform."
  [representation ref-index]
  (let [transform-data (yaml->toucan representation ref-index)
        entity-id (:entity_id transform-data)
        existing (when entity-id
                   (t2/select-one :model/Transform :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing transform" (:name transform-data) "with ref" (:ref representation))
        (t2/update! :model/Transform (:id existing) (dissoc transform-data :entity_id))
        (t2/select-one :model/Transform :id (:id existing)))
      (do
        (log/info "Creating new transform" (:name transform-data))
        (t2/insert-returning-instance! :model/Transform transform-data)))))

;; EXPORT

(defn ->ref [card]
  (format "%s-%s" "transform" (:id card)))

(defn- source-table-ref [table]
  (cond
    (vector? table)
    (let [[db schema table] table]
      {:database db
       :schema schema
       :table table})

    (string? table)
    (let [referred-card (t2/select-one :model/Card :entity_id table)]
      (->ref referred-card))))

(defn- update-source-table [card]
  (if-some [table (get-in card [:mbql_query :source-table])]
    (update-in card [:mbql_query :source-table] source-table-ref)
    card))

(defn- patch-refs [card]
  (-> card
      (update-source-table)))

(defmethod export/export-entity :model/Transform [transform]
  (let [query (serdes/export-mbql (-> transform :source :query))]
    (cond-> {:name (:name transform)
             ;;:version "question-v0"
             :type "transform"
             :ref (->ref transform)
             :description (:description transform)}

      (= "native" (:type query))
      (assoc :query (-> query :native :query)
             :database (:database query))

      (= "query" (:type query))
      (assoc :mbql_query (:query query)
             :database (:database query))

      (= "table" (-> transform :target :type))
      (assoc :target_table {:schema (-> transform :target :schema)
                            :table (-> transform :target :name)})

      :always
      patch-refs

      :always
      v0-common/remove-nils)))
