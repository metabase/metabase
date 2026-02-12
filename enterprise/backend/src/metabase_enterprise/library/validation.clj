(ns metabase-enterprise.library.validation
  (:require
   [clojure.set :as set]
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise check-allowed-content
  "Check if the collection's content matches the allowed content.
  Throws an exception if it does not"
  :feature :library
  [content-type collection-id]
  (when collection-id
    (when-let [collection-type (t2/select-one-fn :type [:model/Collection :type] :id collection-id)]
      (when (and (= collection-type collection/library-collection-type) (not (contains? #{collection/library-data-collection-type
                                                                                          collection/library-metrics-collection-type}
                                                                                        content-type)))
        (throw (ex-info "Cannot add anything to the Library collection" {})))
      (when (and (= collection-type collection/library-data-collection-type) (not (= :table content-type)))
        (throw (ex-info "Can only add tables to the 'Data' collection" {})))
      (when (and (= collection-type collection/library-metrics-collection-type) (not (= :metric content-type)))
        (throw (ex-info "Can only add metrics to the 'Metrics' collection" {})))))
  true)

(defenterprise check-library-update
  "Checks that a collection of type `:library` only contains allowed content."
  metabase-enterprise.library.validation
  :feature :library
  [collection]
  (when (and (contains? #{collection/library-collection-type
                          collection/library-data-collection-type
                          collection/library-metrics-collection-type} (:type collection))
             (seq (set/intersection (set (keys (t2/changes collection)))
                                    #{:name :description :archived :location :personal_owner_id :slug :namespace :type :authority_level :is_sample})))
    (throw (ex-info "Cannot update properties on a Library collection" {})))
  true)
