(ns metabase-enterprise.semantic-layer.validation
  (:require
   [clojure.set :as set]
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise check-allowed-content
  "Check if the collection's content matches the allowed content.
  Throws an exception if it does not"
  :feature :semantic-layer
  [content-type collection-id]
  (when collection-id
    (when-let [collection-type (t2/select-one-fn :type [:model/Collection :type] :id collection-id)]
      (when (and (= collection-type collection/semantic-layer-collection-type) (not (contains? #{collection/semantic-layer-models-collection-type
                                                                                                 collection/semantic-layer-metrics-collection-type}
                                                                                               content-type)))
        (throw (ex-info "Cannot add anything to the Semantic Layer collection" {})))
      (when (and (= collection-type collection/semantic-layer-models-collection-type) (not (= :model content-type)))
        (throw (ex-info "Can only add models to the 'Models' collection" {})))
      (when (and (= collection-type collection/semantic-layer-metrics-collection-type) (not (= :metric content-type)))
        (throw (ex-info "Can only add metrics to the 'Metrics' collection" {})))))
  true)

(defenterprise check-semantic-layer-update
  "Checks that a collection of type `:semantic-layer` only contains allowed content."
  metabase-enterprise.semantic-layer.validation
  :feature :semantic-layer
  [collection]
  (when (and (contains? #{collection/semantic-layer-collection-type
                          collection/semantic-layer-models-collection-type
                          collection/semantic-layer-metrics-collection-type} (:type collection))
             (seq (set/intersection (set (keys (t2/changes collection)))
                                    #{:name :description :archived :location :personal_owner_id :slug :namespace :type :authority_level :is_sample})))
    (throw (ex-info "Cannot update properties on a Library collection" {})))
  true)
