(ns metabase-enterprise.representations.ingestion.v0.model
  "Ingestion logic for v0 model representations.
   Converts validated representation maps into Metabase Card entities (Models).
   
   Models are special types of Cards that serve as reusable 'virtual tables' with
   rich column metadata including display names, descriptions, and semantic types."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.representations.ingestion.common :as ing-com]
   [metabase.config.core :as config]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

;;; ------------------------------------ Column Metadata Processing ------------------------------------

(defn- normalize-type-name
  "Convert type strings to internal keyword format.
   Expects strings like 'type/Text' or 'type/PK' and converts to :type/Text, :type/PK.
   Also handles already-keywordized values."
  [type-str]
  (when type-str
    (keyword (str/trim type-str))))

(defn- process-column-metadata
  "Process column definitions from the representation into result_metadata format."
  [columns]
  (when (seq columns)
    (mapv (fn [{:keys [name display_name description base_type effective_type
                       semantic_type visibility currency] :as _col}]
            (let [normalized-base (normalize-type-name base_type)
                  normalized-eff (normalize-type-name effective_type)
                  normalized-sem (normalize-type-name semantic_type)
                  ;; For field_ref, we need a valid base type (not semantic/relation type)
                  ;; Check if it's actually a base type using isa?
                  valid-base-type? (fn [t]
                                     (and t
                                          (isa? t :type/*)
                                          (not (isa? t :Semantic/*))
                                          (not (isa? t :Relation/*))))
                  field-base-type (cond
                                    (valid-base-type? normalized-base) normalized-base
                                    (valid-base-type? normalized-eff) normalized-eff
                                    :else :type/Text)] ; Default fallback
              (cond-> {:name name
                       :display_name (or display_name name)
                       :field_ref [:field name {:base-type field-base-type}]}
                description (assoc :description description)
                normalized-base (assoc :base_type normalized-base)
                normalized-eff (assoc :effective_type normalized-eff)
                normalized-sem (assoc :semantic_type normalized-sem)
                visibility (assoc :visibility_type visibility)
                currency (assoc :currency currency))))
          columns)))

;;; ------------------------------------ Public API ------------------------------------

(defn representation->model-data
  "Convert a validated v0 model representation into data suitable for creating/updating a Card (Model).
   
   Returns a map with keys matching the Card model fields.
   Does NOT insert into the database - just transforms the data.
   
   Key differences from questions:
   - :type is :model instead of :question
   - Includes result_metadata with column definitions
   - Display is typically :table since models represent structured data"
  [{model-name :name
    :keys [type ref description database collection columns] :as representation}]
  (let [database-id (ing-com/find-database-id database)]
    (when-not database-id
      (throw (ex-info (str "Database not found: " database)
                      {:database database})))
    (merge
     {;; Core fields
      :name model-name
      :description (or description "")
      :display :table ; Models are typically displayed as tables
      :dataset_query (ing-com/representation->dataset-query representation)
      :visualization_settings {}
      :database_id database-id
      :query_type :native ; TODO: Support MBQL queries
      :type :model ; This is what makes it a model instead of a question
      }
     ;; Result metadata with column definitions
     (when columns
       {:result_metadata (process-column-metadata columns)})
     ;; Optional collection
     (when-let [coll-id (ing-com/find-collection-id collection)]
       {:collection_id coll-id}))))

(defn ingest!
  "Ingest a v0 model representation and create or update a Card (Model) in the database.

   Uses ref as a stable identifier for upserts.
   If a model with the same ref exists (via entity_id), it will be updated.
   Otherwise a new model will be created.

   Returns the created/updated Card."
  [representation & {:keys [creator-id]
                     :or {creator-id config/internal-mb-user-id}}]
  (let [model-data (representation->model-data representation)
        ;; Generate stable entity_id from ref and collection
        entity-id (ing-com/generate-entity-id representation)
        existing (when entity-id
                   (t2/select-one :model/Card :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing model" (:name model-data) "with ref" (:ref representation))
        (t2/update! :model/Card (:id existing) (dissoc model-data :entity_id))
        (t2/select-one :model/Card :id (:id existing)))
      (do
        (log/info "Creating new model" (:name model-data))
        (let [model-data-with-creator (-> model-data
                                          (assoc :creator_id creator-id)
                                          (assoc :entity_id entity-id))]
          (first (t2/insert-returning-instances! :model/Card model-data-with-creator)))))))

(comment
  ;; Test column metadata processing
  (process-column-metadata
   [{:name "customer_id"
     :display_name "Customer ID"
     :base_type "Big Integer"
     :semantic_type "Entity Key"}
    {:name "email"
     :display_name "Email Address"
     :base_type "Text"
     :effective_type "Email"
     :visibility "sensitive"}])

  ;; Test with sample model file
  (do
    (require '[metabase-enterprise.representations.ingestion.core :as ing-core])
    (representation->model-data
     (ing-core/load-representation-yaml "test_resources/representations/v0/product-performance.model.yml")))

  ;; Actually ingest a model
  (do
    (require '[metabase-enterprise.representations.ingestion.core :as ing-core])
    (ing-core/ingest-representation
     (ing-core/load-representation-yaml "test_resources/representations/v0/product-performance.model.yml"))))
