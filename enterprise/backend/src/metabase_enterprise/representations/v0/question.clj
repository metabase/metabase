(ns metabase-enterprise.representations.v0.question
  (:require
   [flatland.ordered.map :refer [ordered-map]]
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.card]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.lib.core :as lib]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def toucan-model
  "The toucan model keyword associated with question representations"
  :model/Card)

(defn yaml->toucan
  "Convert a v0 question representation to Toucan-compatible data."
  [representation ref-index]
  (let [database-id (lookup/lookup-database-id ref-index (:database representation))
        query (v0-mbql/import-dataset-query representation ref-index)]
    (-> {:name (or (:display_name representation)
                   (:name representation))
         :description (:description representation)
         :display (:display representation)
         :dataset_query query
         :database_id database-id
         :query_type (if (lib/native-only-query? query) :native :query)
         :type :question}
        u/remove-nils)))

(defn persist!
  "Persist a v0 question representation by creating or updating it in the database."
  [representation ref-index]
  (let [question-data (->> (yaml->toucan representation ref-index)
                           (rep-t2/with-toucan-defaults :model/Card))
        entity-id (:entity_id question-data)
        existing (when entity-id
                   (t2/select-one :model/Card :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing question" (:name question-data) "with ref" (:name representation))
        (t2/update! :model/Card (:id existing) (dissoc question-data :entity_id))
        (t2/select-one :model/Card :id (:id existing)))
      (do
        (log/info "Creating new question" (:name question-data))
        (first (t2/insert-returning-instances! :model/Card question-data))))))

;; -- Export --

(defn export-question
  "Export a Question Card Toucan entity to a v0 question representation."
  [card]
  (let [card-ref (v0-common/unref (v0-common/->ref (:id card) :question))]
    (-> (ordered-map
         :name card-ref
         :type (:type card)
         :version :v0
         :display_name (:name card)
         :description (:description card))
        (merge (v0-mbql/export-dataset-query (:dataset_query card)))
        u/remove-nils)))
