(ns metabase-enterprise.semantic-layer.validation
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise check-allowed-content
  "Check if the collection's content matches the allowed content.
  Throws an exception if it does not"
  :feature :semantic-layer
  [content-type collection-id]
  (when collection-id
    (when-let [collection-type #p (t2/select-one-fn :type [:model/Collection :type] :id collection-id)]
      #_(when (and (= collection-type collection/semantic-layer-collection-type) (not (contains? #{:semantic-layer-model :semantic-layer-metric} content-type)))
          (throw (ex-info "Cannot add anything to the Semantic Layer collection" {})))
      (when (and (= collection-type collection/semantic-layer-models-collection-type) (not (= :model content-type)))
        (throw (ex-info "Can only add models to the 'Models' collection" {})))
      (when (and (= collection-type collection/semantic-layer-metrics-collection-type) (not (= :metric content-type)))
        (throw (ex-info "Can only add metrics to the 'Metrics' collection" {})))))
  true)

