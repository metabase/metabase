(ns metabase-enterprise.representations.v0.transform
  (:require
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
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

(mr/def ::run-trigger
  [:enum {:decode/json keyword
          :description "Optional trigger for when to run the transform"}
   :manual :scheduled :on-change])

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
    [:name ::name]
    [:description ::description]
    [:database ::database]
    [:source ::source]
    [:target ::target]
    [:run_trigger {:optional true} ::run-trigger]
    [:tags {:optional true} ::tags]]
   [:fn {:error/message "Source must have exactly one of :query or :mbql_query"}
    (fn [{:keys [source]}]
      (= 1 (count (filter some? [(:query source) (:mbql_query source)]))))]])

;;; ------------------------------------ Ingestion Functions ------------------------------------

(defn yaml->toucan
  "Convert a validated v0 transform representation into data suitable for creating/updating a Transform.

   Returns a map with keys matching the Transform model fields.
   Does NOT insert into the database - just transforms the data."
  [{transform-name :name
    :keys [description database source target run_trigger] :as representation}]
  (let [database-id (v0-common/find-database-id database)
        ;; TODO: generate-entity-id needs collection ref for stable ID
        ;; For transforms, we don't have collections, so using just the ref for now
        entity-id (v0-common/generate-entity-id (assoc representation :collection "transforms"))]
    (when-not database-id
      (throw (ex-info (str "Database not found: " database)
                      {:database database})))
    ;; Build the transform data structure matching the API format
    {:entity_id entity-id
     :name transform-name
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
              :name (:table target)}
     :run_trigger (or (some-> run_trigger name) "none")
     ;; Tags would need to be resolved to tag IDs
     ;; For now, we'll skip tags in the POC
     }))

(defn persist!
  "Ingest a v0 transform representation and create or update a Transform in the database.

   For POC: Uses ref as a stable identifier for upserts.
   If a transform with the same ref exists (via entity_id), it will be updated.
   Otherwise a new transform will be created.

   Returns the created/updated Transform."
  [representation]
  (let [transform-data (yaml->toucan representation)
        entity-id (:entity_id transform-data)
        existing (when entity-id
                   (t2/select-one :model/Transform :entity_id entity-id))]
    ;; TODO: generate-entity-id needs a stable way to identify transforms
    ;; without collections. Consider using database + ref as the unique key
    (if existing
      (do
        (log/info "Updating existing transform" (:name transform-data) "with ref" (:ref representation))
        (t2/update! :model/Transform (:id existing) (dissoc transform-data :entity_id))
        (t2/select-one :model/Transform :id (:id existing)))
      (do
        (log/info "Creating new transform" (:name transform-data))
        (first (t2/insert-returning-instances! :model/Transform transform-data))))))
