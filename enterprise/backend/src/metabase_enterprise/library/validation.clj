(ns metabase-enterprise.library.validation
  (:require
   [clojure.set :as set]
   [metabase-enterprise.library.db :as library.db]
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defn- library-content-spec
  "A spec for what contents `parent` permits, or `nil` if `parent` is not a library collection at all.

  The Library root only holds folders; a generic (user-created) library folder holds published tables, metrics, and
  more folders; the seeded 'Data' and 'Metrics' trees stay single-purpose."
  [{parent-type :type :as parent}]
  (condp = parent-type
    collection/library-collection-type
    (if (collection/library-root-collection? parent)
      {:allowed-content-types #{collection/library-collection-type
                                collection/library-data-collection-type
                                collection/library-metrics-collection-type}
       :error-message         "Only folders can be added to the Library"}
      {:allowed-content-types #{:table :metric collection/library-collection-type}
       :error-message         "Can only add tables, metrics, and folders to a Library folder"})

    collection/library-data-collection-type
    {:allowed-content-types #{:table collection/library-data-collection-type}
     :error-message         "Can only add tables to the 'Data' collection"}

    collection/library-metrics-collection-type
    {:allowed-content-types #{:metric collection/library-metrics-collection-type}
     :error-message         "Can only add metrics to the 'Metrics' collection"}

    nil))

(defenterprise check-allowed-content
  "Check if the collection's content matches the allowed content.
  Throws an exception if it does not"
  :feature :library
  [content-type collection-id]
  (when collection-id
    (let [parent (library.db/collection-type-and-entity-id collection-id)]
      (when-let [{:keys [allowed-content-types error-message]} (library-content-spec parent)]
        (when-not (allowed-content-types content-type)
          (throw (ex-info error-message {:status-code 400}))))
      (when (and (= content-type :table)
                 (not (collection/can-contain-published-tables? parent)))
        (throw (ex-info "Tables can only be added to Library folders" {:status-code 400})))))
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
                 (not= (:type collection) (:type (library.db/collection-type-and-entity-id parent-id)))))
      (throw (ex-info "Cannot move a Library collection outside the Library" {}))))
  true)
