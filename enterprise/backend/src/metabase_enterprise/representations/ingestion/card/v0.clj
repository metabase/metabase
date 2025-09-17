(ns metabase-enterprise.representations.ingestion.card.v0
  "Ingestion logic for v0 card representations.
   Converts validated representation maps into Metabase Card entities.
   
   This is a POC implementation focusing on simple SQL queries."
  (:require
   [metabase.config.core :as config]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

;;; ------------------------------------ Helpers ------------------------------------

(defn- find-database-id
  "Find database ID by name or ref. Returns nil if not found."
  [database-ref]
  (when database-ref
    (or
     (when (integer? database-ref) database-ref)
     ;; Try to find by name
     (t2/select-one-pk :model/Database :name database-ref))))

(defn- find-collection-id
  "Find collection ID by name or ref. Returns nil if not found."
  [collection-ref]
  (when collection-ref
    (or
     (when (integer? collection-ref) collection-ref)
     ;; Try to find by slug or name
     (t2/select-one-pk :model/Collection :slug collection-ref)
     (t2/select-one-pk :model/Collection :name collection-ref))))

(defn- representation->dataset-query
  "Convert the representation's query format into Metabase's dataset_query format.
   For POC, we're focusing on native SQL queries."
  [{:keys [query mbql_query database] :as representation}]
  (let [database-id (find-database-id database)]
    (cond
      ;; Native SQL query - simple case for POC
      query
      {:type :native
       :native {:query query}
       :database database-id}

      ;; MBQL query - use serdes/import-mbql if it's already in MBQL format
      mbql_query
      (try
        (serdes/import-mbql mbql_query)
        (catch Exception e
          ;; Fall back to simple structure if import fails
          (merge {:type :query
                  :database database-id}
                 mbql_query)))

      :else
      (throw (ex-info "Card must have either 'query' or 'mbql_query'"
                      {:representation representation})))))

;;; ------------------------------------ Public API ------------------------------------

(defn representation->card-data
  "Convert a validated v0 card representation into data suitable for creating/updating a Card.
   
   Returns a map with keys matching the Card model fields.
   Does NOT insert into the database - just transforms the data.
   
   For POC: Focuses on the minimal fields needed."
  [{card-name :name
    :keys [type ref description database collection] :as representation}]
  (let [card-type (keyword (name type))
        database-id (find-database-id database)]
    (when-not database-id
      (throw (ex-info (str "Database not found: " database)
                      {:database database})))
    (merge
     {;; :id
      ;; :created_at
      ;; :updated_at
      :name card-name
      :description (or description "")
      :display :table ; Default display type
      :dataset_query (representation->dataset-query representation)
      :visualization_settings {}
      ;; :creator_id
      :database_id database-id
      ;; :table_id
      :query_type :native ; TODO
      ;; :archived
      ;; :collection_id ; SKIP! Set later
      ;; :public_uuid
      :type card-type}
     ;; Optional fields
     (when-let [coll-id (find-collection-id collection)]
       {:collection_id coll-id}))))

(defn ingest-card!
  "Ingest a v0 card representation and create or update a Card in the database.
   
   For POC: Uses ref as a stable identifier for upserts.
   If a card with the same ref exists (via entity_id), it will be updated.
   Otherwise a new card will be created.
   
   Returns the created/updated Card."
  [representation & {:keys [creator-id]
                     :or {creator-id config/internal-mb-user-id}}]
  (let [card-data (representation->card-data representation)
        ;; For POC, use ref directly as entity_id
        entity-id (when-let [ref (:ref representation)]
                    (u/generate-nano-id))
        existing (when entity-id
                   (t2/select-one :model/Card :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing card" (:name card-data) "with ref" (:ref representation))
        (t2/update! :model/Card (:id existing) (dissoc card-data :entity_id))
        (t2/select-one :model/Card :id (:id existing)))
      (do
        (log/info "Creating new card" (:name card-data))
        (let [card-data-with-creator (-> card-data
                                         (assoc :creator_id creator-id)
                                         (assoc :entity_id entity-id))]
          (first (t2/insert-returning-instances! :model/Card card-data-with-creator)))))))

(comment
  (do ; make the sample_database
    (require '[toucan2.core :as t2])
    (require '[metabase.test :as mt])
    (t2/insert-returning-instance! :model/Database {:name "sample_database" :engine :h2 :details {:db "mem:sample"} :is_sample true}))
  (do ; load a sample card (question)
    (require '[metabase-enterprise.representations.ingestion.core :as ing-core])
    (representation->card-data
     (ing-core/ingest-representation
      (ing-core/parse-representation "test_resources/representations/v0/monthly-revenue.card.yml")))))
