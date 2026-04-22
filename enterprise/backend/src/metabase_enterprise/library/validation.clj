(ns metabase-enterprise.library.validation
  (:require
   [clojure.set :as set]
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(def ^:private library-collection-content-specs
  "A map from the `:type` of the parent collection to a spec for what contents it permits."
  {collection/library-collection-type
   {:allowed-content-types #{collection/library-data-collection-type
                             collection/library-metrics-collection-type}
    :error-message         "Cannot add anything to the Library collection"}

   collection/library-data-collection-type
   {:allowed-content-types #{:table collection/library-data-collection-type}
    :error-message         "Can only add tables to the 'Data' collection"}

   collection/library-metrics-collection-type
   {:allowed-content-types #{:metric collection/library-metrics-collection-type}
    :error-message         "Can only add metrics to the 'Metrics' collection"}})

(defenterprise check-allowed-content
  "Check if the collection's content matches the allowed content.
  Throws an exception if it does not"
  :feature :library
  [content-type collection-id]
  (when collection-id
    (when-let [{:keys [allowed-content-types error-message]} (some-> (t2/select-one-fn :type [:model/Collection :type]
                                                                                       :id collection-id)
                                                                     library-collection-content-specs)]
      (when-not (allowed-content-types content-type)
        (throw (ex-info error-message {})))))
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
