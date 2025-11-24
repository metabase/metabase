(ns metabase-enterprise.representations.v0.metric
  (:require
   [flatland.ordered.map :refer [ordered-map]]
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.v0.card]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.lib.core :as lib]
   [metabase.util :as u]
   [representations.schema.v0.column :as rep-v0-column]))

(def toucan-model
  "The toucan model keyword associated with metric representations"
  :model/Card)

(defn yaml->toucan
  "Convert a v0 metric representation to Toucan-compatible data."
  [{metric-name :display_name
    :keys [name description database columns] :as representation}
   ref-index]
  (let [database-id (lookup/lookup-database-id ref-index database)
        dataset-query (v0-mbql/import-dataset-query representation ref-index)
        collection-id (when (:collection representation)
                        (v0-common/lookup-id ref-index (:collection representation)))]
    (-> {;; Core fields
         :name (or metric-name name)
         :description description
         :dataset_query dataset-query
         :database_id database-id
         :query_type (if (lib/native-only-query? dataset-query) :native :query)
         :type :metric
         :result_metadata columns
         :collection_id collection-id}
        u/remove-nils)))

;;; -- Export --

(defn export-metric
  "Export a Metric Card Toucan entity to a v0 metric representation."
  [card]
  (-> (ordered-map
       :name (v0-common/unref (v0-common/->ref (:id card) :metric))
       :type (:type card)
       :version :v0
       :display_name (:name card)
       :description (:description card)
       :columns (into []
                      (map #(select-keys % rep-v0-column/column-keys))
                      (:result_metadata card)))
      (merge (v0-mbql/export-dataset-query (:dataset_query card)))
      u/remove-nils))
