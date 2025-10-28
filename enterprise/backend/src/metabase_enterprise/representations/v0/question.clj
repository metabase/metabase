(ns metabase-enterprise.representations.v0.question
  (:require
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.card]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defmethod import/type->schema [:v0 :question] [_]
  ::question)

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Type must be 'question'"}
   :question])

(mr/def ::version
  [:enum {:decode/json keyword
          :description "Version of this question schema"}
   :v0])

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

(mr/def ::lib-query
  [:and
   {:description "MBQL5 query to execute"}
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
    [:version ::version]
    [:ref ::ref]
    [:name {:optional true} ::name]
    [:description {:optional true} ::description]
    [:database ::database]
    [:query {:optional true} ::query]
    [:mbql_query {:optional true} ::mbql-query]
    [:lib_query {:optional true} ::lib-query]
    [:collection {:optional true} ::collection]]
   [:fn {:error/message "Must have exactly one of :query or :mbql_query"}
    (fn [{:keys [query mbql_query lib_query]}]
      (= 1 (count (filter some? [query mbql_query lib_query]))))]])

(defmethod v0-common/type->model :question
  [_]
  :model/Card)

;;; ------------------------------------ Ingestion ------------------------------------

(defmethod import/yaml->toucan [:v0 :question]
  [representation ref-index]
  (let [database-id (lookup/lookup-database-id ref-index (:database representation))
        ;; TODO: once we've cleaned up mbql stuff, this explicit lookup should be superfluous.
        ;; Just pull it off of the dataset-query
        query (-> (assoc representation :database database-id)
                  (v0-mbql/import-dataset-query ref-index))]
    (-> {:name (:name representation)
         :description (:description representation)
         :display (:display representation)
         :dataset_query query
         :database_id database-id
         :query_type (if (lib/native-only-query? query)
                       :native
                       :query)
         :type :question}
        u/remove-nils)))

(defmethod import/persist! [:v0 :question]
  [representation ref-index]
  (let [question-data (->> (import/yaml->toucan representation ref-index)
                           (rep-t2/with-toucan-defaults :model/Card))
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

(defmethod export/export-entity :question [card]
  (let [card-ref (v0-common/unref (v0-common/->ref (:id card) :question))]
    (-> {:name        (:name card)
         :type        (:type card)
         :version     :v0
         :ref         card-ref
         :entity-id   (:entity_id card)
         :description (:description card)}

        (merge (v0-mbql/export-dataset-query (:dataset_query card)))
        u/remove-nils)))
