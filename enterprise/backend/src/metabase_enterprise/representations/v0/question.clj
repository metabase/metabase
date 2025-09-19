(ns metabase-enterprise.representations.v0.question
  (:require
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.config.core :as config]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Type must be 'question'"}
   :v0/question])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the card, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the card"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining what the card does"}
   [:or
    :nil
    :string]])

(mr/def ::query
  [:and
   {:description "Native SQL query to execute"}
   ::lib.schema.common/non-blank-string])

(mr/def ::mbql-query
  [:and
   {:description "MBQL (Metabase Query Language) query to execute"}
   any?])

(mr/def ::database
  [:and
   {:description "Name of the database to run the query against"}
   ::lib.schema.common/non-blank-string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing the card"}
   any?])

;;; ------------------------------------ Main Schema ------------------------------------

(mr/def ::question
  [:and
   [:map
    {:description "v0 schema for human-writable question representation"}
    [:type ::type]
    [:ref ::ref]
    [:name {:optional true} ::name]
    [:description {:optional true} ::description]
    [:database ::database]
    [:query {:optional true} ::query]
    [:mbql_query {:optional true} ::mbql-query]
    [:collection {:optional true} ::collection]]
   [:fn {:error/message "Must have exactly one of :query or :mbql_query"}
    (fn [{:keys [query mbql_query]}]
      (= 1 (count (filter some? [query mbql_query]))))]])

;;; ------------------------------------ Ingestion ------------------------------------

(defn yaml->toucan
  "Convert a validated v0 question representation into data suitable for creating/updating a Card (Question).

   Returns a map with keys matching the Card model fields.
   Does NOT insert into the database - just transforms the data.

   For POC: Focuses on the minimal fields needed."
  [{question-name :name
    :keys [type ref description database collection] :as representation}
   & {:keys [creator-id]
      :or {creator-id config/internal-mb-user-id}}]
  (let [database-id (v0-common/find-database-id database)
        ;; Ugliness within ugliness:
        entity-id (v0-common/generate-entity-id representation)
        query (v0-common/representation->dataset-query representation)]
    (when-not database-id
      (throw (ex-info (str "Database not found: " database)
                      {:database database})))
    (merge
     {;; :id
      ;; :created_at
      ;; :updated_at
      :entity_id entity-id
      :creator_id creator-id
      :name question-name
      :description (or description "")
      :display :table                   ; TODO: Default display type
      :dataset_query query
      :visualization_settings {}
      ;; :creator_id
      :database_id database-id
      ;; :table_id
      :query_type (:type query)
      ;; :archived
      ;; :public_uuid
      :type :question}
     ;; Optional fields
     (when-let [coll-id (v0-common/find-collection-id collection)]
       {:collection_id coll-id}))))

(defn persist!
  "Ingest a v0 question representation and create or update a Card (Question) in the database.

   For POC: Uses ref as a stable identifier for upserts.
   If a question with the same ref exists (via entity_id), it will be updated.
   Otherwise a new question will be created.

   Returns the created/updated Card."
  [representation & {:keys [creator-id]
                     :or {creator-id config/internal-mb-user-id}}]
  (let [question-data (yaml->toucan representation :creator-id creator-id)
        entity-id (:entity_id question-data)
        existing (when entity-id
                   (t2/select-one :model/Card :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing question" (:name question-data) "with ref" (:ref representation))
        (t2/update! :model/Card (:id existing) (dissoc question-data :entity_id))
        (t2/select-one :model/Card :id (:id existing)))
      (do
        (log/info "Creating new question" (:name question-data))
        (first (t2/insert-returning-instances! :model/Card question-data))))))
