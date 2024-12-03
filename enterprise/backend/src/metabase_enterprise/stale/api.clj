(ns metabase-enterprise.stale.api
  "API endpoints for retrieving or archiving stale (unused) items.
  Currently supports Dashboards and Cards."
  (:require
   [compojure.core :refer [GET]]
   [java-time.api :as t]
   [metabase-enterprise.stale :as stale]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.collection :as api.collection]
   [metabase.api.common :as api]
   [metabase.models.card :as card]
   [metabase.models.collection :as collection]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- effective-children-ids
  "Returns effective children ids for collection."
  [collection _permissions-set]
  (let [visible-collection-ids (set (collection/visible-collection-ids {:permission-level :write}))
        all-descendants (map :id (collection/descendants-flat collection))]
    (filterv visible-collection-ids all-descendants)))

(defmulti present-model-items
  "Given a model and a list of items, return the items in the format the API client expects. Note that order does not
  matter! The calling function, `present-items`, is responsible for ensuring the order is maintained."
  (fn [model _items] model))

(defn- present-collections [rows]
  (let [coll-id->coll (into {} (for [{coll :collection} rows
                                     :when (some? coll)] [(:id coll) coll]))
        to-fetch (into #{} (comp (keep :effective_location)
                                 (mapcat collection/location-path->ids)
                                 (remove coll-id->coll))
                       (vals coll-id->coll))
        coll-id->coll (merge (if (seq to-fetch)
                               (t2/select-pk->fn identity :model/Collection :id [:in to-fetch])
                               {})
                             coll-id->coll)
        annotate (fn [x]
                   (assoc x :collection {:id (get-in x [:collection :id])
                                         :name (get-in x [:collection :name])
                                         :authority_level (get-in x [:collection :authority_level])
                                         :type (get-in x [:collection :type])
                                         :effective_ancestors (if-let [loc (:effective_location (:collection x))]
                                                                (->> (collection/location-path->ids loc)
                                                                     (map coll-id->coll)
                                                                     (map #(select-keys % [:id :name :authority_level :type])))
                                                                [])}))]
    (map annotate rows)))

(defmethod present-model-items :model/Card [_ cards]
  (->> (t2/hydrate (t2/select [:model/Card
                               :id
                               :dashboard_id
                               :description
                               :collection_id
                               :name
                               :entity_id
                               :archived
                               :collection_position
                               :display
                               :collection_preview
                               :database_id
                               [nil :location]
                               :dataset_query
                               :last_used_at
                               [{:select   [:status]
                                 :from     [:moderation_review]
                                 :where    [:and
                                            [:= :moderated_item_type "card"]
                                            [:= :moderated_item_id :report_card.id]
                                            [:= :most_recent true]]
                                 ;; limit 1 to ensure that there is only one result but this invariant should hold true, just
                                 ;; protecting against potential bugs
                                 :order-by [[:id :desc]]
                                 :limit    1}
                                :moderated_status]]
                              :id [:in (set (map :id cards))])
                   :can_write :can_delete :can_restore [:collection :effective_location] :dashboard_count [:dashboard :moderation_status])
       present-collections
       (map (fn [card]
              (-> card
                  (assoc :model (if (card/model? card) "dataset" "card"))
                  (assoc :fully_parameterized (api.collection/fully-parameterized-query? card))
                  (dissoc :dataset_query))))))

(defn- annotate-dashboard-with-collection-info
  "For dashboards, we want `here` and `location` since they can contain cards as children."
  [dashboards]
  (for [{parent-coll :collection
         :as dashboard} (api.collection/annotate-dashboards dashboards)]
    (assoc dashboard
           :location (or (some-> parent-coll collection/children-location)
                         "/"))))

(defmethod present-model-items :model/Dashboard [_ dashboards]
  (->> (t2/hydrate (t2/select [:model/Dashboard
                               :id
                               :description
                               :collection_id
                               :name
                               :entity_id
                               :archived
                               :collection_position
                               [:last_viewed_at :last_used_at]
                               ["dashboard" :model]
                               [nil :dashboard_id]
                               [nil :location]
                               [nil :database_id]]

                              :id [:in (set (map :id dashboards))])
                   :can_write :can_delete :can_restore [:collection :effective_location])
       annotate-dashboard-with-collection-info
       present-collections))

(api/defendpoint GET "/:id"
  "A flexible endpoint that returns stale entities, in the same shape as collections/items, with the following options:
  - `before_date` - only return entities that were last edited before this date (default: 6 months ago)
  - `is_recursive` - if true, return entities from all children of the collection, not just the direct children (default: false)
  - `sort_column` - the column to sort by (default: name)
  - `sort_direction` - the direction to sort by (default: asc)"
  [id before_date is_recursive sort_column sort_direction]
  {id             [:or ms/PositiveInt [:= :root]]
   before_date    [:maybe :string]
   is_recursive   [:boolean {:default false}]
   sort_column    [:maybe {:default :name} [:enum :name :last_used_at]]
   sort_direction [:maybe {:default :asc} [:enum :asc :desc]]}
  (premium-features/assert-has-feature :collection-cleanup (tru "Collection Cleanup"))
  (let [before-date    (if before_date
                         (try (t/local-date "yyyy-MM-dd" before_date)
                              (catch Exception _
                                (throw (ex-info (str "invalid before_date: '"
                                                     before_date
                                                     "' expected format: 'yyyy-MM-dd'")
                                                {:status 400}))))
                         (t/minus (t/local-date) (t/months 6)))
        collection     (if (= id :root)
                         collection/root-collection
                         (t2/select-one :model/Collection id))
        _              (api/read-check collection)
        collection-ids (->> (if is_recursive
                              (conj (effective-children-ids collection @api/*current-user-permissions-set*)
                                    id)
                              [id])
                            (mapv (fn root->nil [x] (if (= :root x) nil x)))
                            set)

        {:keys [total rows]}
        (stale/find-candidates {:collection-ids collection-ids
                                :cutoff-date    before-date
                                :limit          (request/limit)
                                :offset         (request/offset)
                                :sort-column    sort_column
                                :sort-direction sort_direction})

        snowplow-payload {:event                   :stale-items-read
                          :collection_id           (when-not (= :root id) id)
                          :total_stale_items_found total
                          ;; convert before-date to a date-time string before sending it.
                          :cutoff_date             (format "%sT00:00:00Z" (str before-date))}]
    (snowplow/track-event! ::snowplow/cleanup snowplow-payload)
    {:total  total
     :data   (api/present-items present-model-items rows)
     :limit  (request/limit)
     :offset (request/offset)}))

(api/define-routes)
