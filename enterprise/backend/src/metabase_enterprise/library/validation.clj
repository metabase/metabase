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
    (let [collection-type (t2/select-one-fn :type [:model/Collection :type] :id collection-id)]
      (when-let [{:keys [allowed-content-types error-message]} (some-> collection-type
                                                                       library-collection-content-specs)]
        (when-not (allowed-content-types content-type)
          (throw (ex-info error-message {:status-code 400}))))
      (when (and (= content-type :table) (not= collection-type collection/library-data-collection-type))
        (throw (ex-info "Tables can only be added to 'Data' collections" {:status-code 400})))))
  true)

(defenterprise check-library-update
  "Checks that a collection of type `:library` only contains allowed content."
  metabase-enterprise.library.validation
  :feature :library
  [collection]
  (let [change-keys (set (keys (t2/changes collection)))]
    (when (and (collection/library-root-collection? collection)
               (seq (set/intersection change-keys
                                      #{:name :description :archived :location :personal_owner_id :slug :namespace :type :authority_level :is_sample})))
      (throw (ex-info "Cannot update properties on a Library collection" {})))
    (when (and (collection/is-library-collection? (:id collection))
               (contains? change-keys :location)
               (when-let [parent-id (collection/location-path->parent-id (:location collection))]
                 (not= (:type collection) (t2/select-one-fn :type :model/Collection :id parent-id))))
      (throw (ex-info "Cannot move a Library collection outside the Library" {}))))
  true)
