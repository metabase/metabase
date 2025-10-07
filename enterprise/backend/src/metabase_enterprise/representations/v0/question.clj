(ns metabase-enterprise.representations.v0.question
  (:require
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defmethod import/type->schema :v0/question [_]
  ::question)

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
   {:description "MBQL query to execute"}
   any?])

(mr/def ::database
  [:and
   {:description "Database reference: integer ID, name string, or ref string"}
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

(defmethod import/yaml->toucan :v0/question
  [{question-name :name
    :keys [_type _ref entity-id description database collection] :as representation}
   ref-index]
  (let [database-id (v0-common/resolve-database-id database ref-index)
        query (-> (assoc representation :database database-id)
                  (v0-mbql/import-dataset-query ref-index))]
    {:entity_id (or entity-id
                    (v0-common/generate-entity-id representation))
     :creator_id (or api/*current-user-id*
                     config/internal-mb-user-id)
     :name question-name
     :description (or description "")
     :display :table
     :dataset_query query
     :visualization_settings {}
     :database_id database-id
     :query_type (if (= (:type query) "native") :native :query)
     :type :question
     :collection_id (v0-common/find-collection-id collection)}))

(defmethod import/persist! :v0/question
  [representation ref-index]
  (let [question-data (import/yaml->toucan representation ref-index)
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

(defn- patch-refs-for-export [query]
  (-> query
      (v0-mbql/->ref-database)
      (v0-mbql/->ref-source-table)
      (v0-mbql/->ref-fields)))

(defmethod export/export-entity :question [card]
  (let [query    (patch-refs-for-export (:dataset_query card))
        card-ref (v0-common/unref (v0-common/->ref (:id card) :question))]
    (cond-> {:name        (:name card)
             :type        (:type card)
             :ref         card-ref
             :entity-id   (:entity_id card)
             :description (:description card)}

      (= :native (:type query))
      (assoc :query (-> query :native :query)
             :database (:database query))

      (= :query (:type query))
      (assoc :mbql_query (:query query)
             :database (:database query))

      :always
      u/remove-nils)))
