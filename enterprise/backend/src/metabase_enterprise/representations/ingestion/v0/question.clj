(ns metabase-enterprise.representations.ingestion.v0.question
  "Ingestion logic for v0 question representations.
   Converts validated representation maps into Metabase Card entities (Questions).

   This is a POC implementation focusing on simple SQL queries."
  (:require
   [metabase-enterprise.representations.ingestion.common :as ing-com]
   [metabase.config.core :as config]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

;;; ------------------------------------ Public API ------------------------------------

(defn yaml->toucan
  "Convert a validated v0 question representation into data suitable for creating/updating a Card (Question).

   Returns a map with keys matching the Card model fields.
   Does NOT insert into the database - just transforms the data.

   For POC: Focuses on the minimal fields needed."
  [{question-name :name
    :keys [type ref description database collection] :as representation}
   & {:keys [creator-id]
      :or {creator-id config/internal-mb-user-id}}]
  (let [database-id (ing-com/find-database-id database)
        ;; Ugliness within ugliness:
        entity-id (ing-com/generate-entity-id representation)
        query (ing-com/representation->dataset-query representation)]
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
      :display :table                   ; Default display type
      :dataset_query query
      :visualization_settings {}
      ;; :creator_id
      :database_id database-id
      ;; :table_id
      :query_type (:type query)
      ;; :archived
      ;; :collection_id ; SKIP! Set later
      ;; :public_uuid
      :type :question}
     ;; Optional fields
     (when-let [coll-id (ing-com/find-collection-id collection)]
       {:collection_id coll-id}))))

(defn ingest!
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

(comment
  (do ; make the sample_database
    (require '[toucan2.core :as t2])
    (require '[metabase.test :as mt])
    (t2/insert-returning-instance! :model/Database {:name "Sample Database" :engine :h2 :details {:db "mem:sample"} :is_sample true}))
  (do ; load a sample question
    (require '[metabase-enterprise.representations.ingestion.core :as ing-core])
    (yaml->toucan
     (ing-core/ingest-representation
      (ing-core/load-representation-yaml "test_resources/representations/v0/monthly-revenue.question.yml"))))
  (do ; load AND WRITE a sample question
    (require '[metabase-enterprise.representations.ingestion.core :as ing-core])
    (ingest!
     (ing-core/ingest-representation
      (ing-core/load-representation-yaml "test_resources/representations/v0/monthly-revenue.question.yml")))))
