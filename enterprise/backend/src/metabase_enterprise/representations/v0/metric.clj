(ns metabase-enterprise.representations.v0.metric
  (:require
   [flatland.ordered.map :refer [ordered-map]]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.card]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.lib.core :as lib]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [representations.schema.v0.column :as rep-v0-column]
   [toucan2.core :as t2]))

(defmethod v0-common/type->model :metric
  [_]
  :model/Card)

(defmethod import/yaml->toucan [:v0 :metric]
  [{metric-name :display_name
    :keys [_name description database collection columns] :as representation}
   ref-index]
  (let [database-id (lookup/lookup-database-id ref-index database)
        ;; TODO: once we've cleaned up mbql stuff, this explicit lookup should be superfluous.
        ;; Just pull it off of the dataset-query
        dataset-query (-> (assoc representation :database database-id)
                          (v0-mbql/import-dataset-query ref-index))]
    (-> {;; Core fields
         :name metric-name
         :description description
         :dataset_query dataset-query
         :database_id database-id
         :query_type (if (lib/native-only-query? dataset-query) :native :query)
         :type :metric
         :result_metadata columns
         :collection_id (v0-common/find-collection-id collection)}
        u/remove-nils)))

(defmethod import/persist! [:v0 :metric]
  [representation ref-index]
  (let [metric-data (->> (import/yaml->toucan representation ref-index)
                         (rep-t2/with-toucan-defaults :model/Card))
        ;; Generate stable entity_id from ref and collection
        entity-id (v0-common/generate-entity-id representation)
        existing (when entity-id
                   (t2/select-one :model/Card :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing metric" (:name metric-data) "with name" (:name representation))
        (t2/update! :model/Card (:id existing) (dissoc metric-data :entity_id))
        (t2/select-one :model/Card :id (:id existing)))
      (do
        (log/info "Creating new metric" (:name metric-data))
        (let [metric-data-with-creator (-> metric-data
                                           (assoc :creator_id (or api/*current-user-id*
                                                                  config/internal-mb-user-id))
                                           (assoc :entity_id entity-id))]
          (first (t2/insert-returning-instances! :model/Card metric-data-with-creator)))))))

;;; -- Export --

(defmethod export/export-entity :metric [card]
  (-> (ordered-map
       :name         (v0-common/unref (v0-common/->ref (:id card) :metric))
       :type         (:type card)
       :version      :v0
       :display_name (:name card)
       :description  (:description card)
       :columns      (into []
                           (map #(select-keys % rep-v0-column/column-keys))
                           (:result_metadata card)))

      (merge (v0-mbql/export-dataset-query (:dataset_query card)))
      u/remove-nils))
