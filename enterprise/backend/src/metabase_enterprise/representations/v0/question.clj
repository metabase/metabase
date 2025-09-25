(ns metabase-enterprise.representations.v0.question
  (:require
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.config.core :as config]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.serialization :as serdes]
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
      :database_id database-id
      ;; :table_id
      ;; :archived
      ;; :public_uuid
      :query_type (if (= (:type query) "native") :native :query)
      :type :question}
     ;; Optional fields
     (when-let [coll-id (v0-common/find-collection-id collection)]
       {:collection_id coll-id}))))

(defn- update-database-for-import [question collection-ref]
  (if (v0-common/ref? (:database question))
    (let [ref (v0-common/unref (:database question))
          db-entity-id (v0-common/entity-id ref nil)
          db (t2/select-one :model/Database :entity_id db-entity-id)]
      (assoc question :database (:id db)))
    question))

(defn- update-source-table-for-import [question collection-ref]
  (let [table-ref (:source_table (:mbql_query question))]
    (if (v0-common/ref? (:database table-ref))
      (let [ref (v0-common/unref (:database table-ref))
            db-entity-id (v0-common/entity-id ref nil)
            db (t2/select-one :model/Database :entity_id db-entity-id)
            table (t2/select-one :model/Table
                                 :db_id (:id db)
                                 :schema (:schema table-ref)
                                 :name (:table table-ref))]
        (assoc-in question [:mbql_query :source_table] (:id table)))
      question)))

(defn- patch-refs-for-import [question collection-ref]
  (-> question
      (update-database-for-import collection-ref)
      (update-source-table-for-import collection-ref)))

(defn persist!
  "Ingest a v0 question representation and create or update a Card (Question) in the database.

   For POC: Uses ref as a stable identifier for upserts.
   If a question with the same ref exists (via entity_id), it will be updated.
   Otherwise a new question will be created.

   Returns the created/updated Card."
  [representation & {:keys [creator-id]
                     :or {creator-id config/internal-mb-user-id}}]
  (let [representation (patch-refs-for-import representation nil)
        question-data (yaml->toucan representation :creator-id creator-id)
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

;; -- Export --

(defn- source-table-ref [table]
  (when-some [t (t2/select-one :model/Table table)]
    (-> {:database (v0-common/->ref (:db_id t) :database)
         :schema (:schema t)
         :table (:name t)}
        v0-common/remove-nils)))

(defn- table-ref [table-id]
  (when-some [t (t2/select-one :model/Table table-id)]
    (-> {:database (v0-common/->ref (:db_id t) :database)
         :schema (:schema t)
         :table (:name t)}
        v0-common/remove-nils)))

(defn- update-source-table-for-export [query]
  (if (-> query :query :source-table)
    (assoc-in query [:query :source-table]
              (table-ref (-> query :query :source-table)))
    query))

(defn- update-database-for-export [query]
  (if (:database query)
    (update query :database v0-common/->ref :database)
    query))

(defn- update-fields-for-export [query]
  (clojure.walk/postwalk (fn [node]
                           (if (and (vector? node)
                                    (= :field (first node)))
                             (let [[_ id] node
                                   field (t2/select-one :model/Field id)
                                   tr (table-ref (:table_id field))]
                               (assoc tr :field (:name field)))
                             node))
                         query))

(defn- patch-refs-for-export [query]
  (-> query
      (update-database-for-export)
      (update-source-table-for-export)
      (update-fields-for-export)))

(defn export [card]
  (let [query (patch-refs-for-export (:dataset_query card))]
    (prn query)
    (cond-> {:name (:name card)
             ;;:version "question-v0"
             :type (:type card)
             :ref (v0-common/->ref (:id card) :question)
             :description (:description card)}

      (= :native (:type query))
      (assoc :query (-> query :native :query)
             :database (:database query))

      (= :query (:type query))
      (assoc :mbql_query (:query query)
             :database (:database query))

      :always
      v0-common/remove-nils)))

(comment
  (let [q (t2/select-one :model/Card :id 93)]
    (clojure.data/diff (:dataset_query q)
                       (patch-refs-for-export (:dataset_query q))))

  (source-table-ref 2)

  (v0-common/refs (export (t2/select-one :model/Card :id 93)))
  (t2/select-one :model/Table 2)
  (t2/select-one :model/Field 57)

  (patch-refs-for-import (export (t2/select-one :model/Card :id 93)) nil)

  (clojure.pprint/pprint (export (t2/select-one :model/Card :id 123))))
