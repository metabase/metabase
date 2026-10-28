(ns metabase-enterprise.library.validation
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.library.db :as library.db]
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(def ^:private library-collection-content-specs
  "A map from the `:type` of the parent collection to a spec for what contents it permits."
  {collection/library-collection-type
   {:allowed-content-types #{collection/library-data-collection-type
                             collection/library-metrics-collection-type
                             collection/library-dashboards-collection-type}
    :error-message         "Cannot add anything to the semantic layer"}

   collection/library-data-collection-type
   {:allowed-content-types #{:table collection/library-data-collection-type}
    :error-message         "Can only add tables to the 'Data' collection"}

   collection/library-metrics-collection-type
   {:allowed-content-types #{:metric collection/library-metrics-collection-type}
    :error-message         "Can only add metrics to the 'Metrics' collection"}

   collection/library-dashboards-collection-type
   {:allowed-content-types #{:model/Dashboard
                             :dashboard-question
                             :model/Pulse
                             :model/Timeline
                             collection/library-dashboards-collection-type}
    :error-message         "Can only add dashboards to the 'Dashboards' collection"}})

(defenterprise check-library-content
  "Check if the collection's content matches the allowed content.
  Throws an exception if it does not"
  :feature :library
  [content-type collection-id]
  (when collection-id
    (let [collection-type (library.db/collection-type collection-id)]
      (when-let [{:keys [allowed-content-types error-message]} (some-> collection-type
                                                                       library-collection-content-specs)]
        (when-not (allowed-content-types content-type)
          (throw (ex-info error-message {:status-code 400}))))
      (when (and (= content-type :table) (not= collection-type collection/library-data-collection-type))
        (throw (ex-info "Tables can only be added to 'Data' collections" {:status-code 400})))))
  true)

(defn- check-library-dashboard-card-ids
  [dashboard-id card-ids]
  (when-let [violations (not-empty (library.db/non-library-card-ids card-ids))]
    (when-let [rejected (seq (sort (set/difference violations
                                                   (library.db/dashboard-referenced-card-ids dashboard-id violations))))]
      (throw (ex-info (tru "Only questions from the Library can be added to a Library dashboard. Card IDs not in the Library: {0}. Use a metric from the Library, or create a new question on this dashboard instead."
                           (str/join ", " rejected))
                      {:status-code 400
                       :card-ids    (vec rejected)})))))

(defenterprise check-library-dashboard-cards
  "Throws if the Dashboard `dashboard-id` is in a Library dashboards collection and `card-ids` includes a Card outside
  every Library collection that the Dashboard does not already reference."
  metabase-enterprise.library.validation
  :feature :library
  [dashboard-id card-ids]
  (let [card-ids (set (remove nil? card-ids))]
    (when (and dashboard-id
               (seq card-ids)
               (library.db/library-dashboard? dashboard-id))
      (check-library-dashboard-card-ids dashboard-id card-ids)))
  true)

(defenterprise check-library-dashcard-series-cards
  "[[check-library-dashboard-cards]] for series `card-ids` of the DashboardCard `dashcard-id`."
  metabase-enterprise.library.validation
  :feature :library
  [dashcard-id card-ids]
  (let [card-ids (set (remove nil? card-ids))]
    (when-let [dashboard-id (when (and dashcard-id (seq card-ids))
                              (library.db/library-dashcard-dashboard-id dashcard-id))]
      (check-library-dashboard-card-ids dashboard-id card-ids)))
  true)

(defenterprise check-library-dashboard-move
  "Throws if a Dashboard would move from `old-collection-id` outside every Library dashboards Collection into
  `new-collection-id` inside one."
  metabase-enterprise.library.validation
  :feature :library
  [old-collection-id new-collection-id]
  (when new-collection-id
    (let [library-ids (library.db/collection-ids-of-types (filterv some? [old-collection-id new-collection-id])
                                                          [collection/library-dashboards-collection-type])]
      (when (and (contains? library-ids new-collection-id)
                 (not (contains? library-ids old-collection-id)))
        (throw (ex-info (tru "Dashboards can''t be moved into the Library. Duplicate the dashboard into the Library instead.")
                        {:status-code 400})))))
  true)

(defn- dashboard-label
  [{:keys [name archived]}]
  (if archived
    (tru "{0} (in the trash)" name)
    name))

(defenterprise check-library-card-move
  "Throws if `card`, as it will be saved, would leave the Library Collection `old-collection-id` for a non-Library
  Collection while a Library dashboard, trashed or not, other than its own Dashboard uses it."
  metabase-enterprise.library.validation
  :feature :library
  [{card-id :id card-type :type dashboard-id :dashboard_id new-collection-id :collection_id} old-collection-id]
  (when old-collection-id
    (let [library-ids (library.db/collection-ids-of-types (filterv some? [old-collection-id new-collection-id])
                                                          (vec collection/library-collection-types))]
      (when (and (contains? library-ids old-collection-id)
                 (not (contains? library-ids new-collection-id)))
        ;; a dashboard question follows its dashboard out of the Library, so its own dashboard doesn't count
        (when-let [dashboards (seq (remove #(= dashboard-id (:id %))
                                           (library.db/library-dashboards-referencing-card card-id)))]
          (let [names (str/join ", " (map dashboard-label dashboards))]
            (throw (ex-info (if (= :metric (keyword card-type))
                              (tru "This metric can''t be moved out of the Library because these Library dashboards use it: {0}. Remove it from them first." names)
                              (tru "This question can''t be moved out of the Library because these Library dashboards use it: {0}. Remove it from them first." names))
                            {:status-code 400})))))))
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
      (throw (ex-info "Cannot update properties on a semantic layer collection" {})))
    (when (and (collection/is-library-collection? (:id collection))
               (contains? change-keys :location)
               (when-let [parent-id (collection/location-path->parent-id (:location collection))]
                 (not= (:type collection) (library.db/collection-type parent-id))))
      (throw (ex-info "Cannot move a semantic layer collection outside the semantic layer" {}))))
  true)
