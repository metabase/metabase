(ns metabase-enterprise.stale.db
  "Application database queries for the stale module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [toucan2.core :as t2]))

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection collection-id))

(defn collections-by-id
  "A map of ID to Collection for `collection-ids`."
  [collection-ids]
  (t2/select-pk->fn identity :model/Collection :id [:in collection-ids]))

(defn stale-cards
  "The listing columns of the Cards with `card-ids`, with their latest moderation status."
  [card-ids]
  (t2/select [:model/Card
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
              :card_schema
              :last_used_at
              [^:allow-subquery
               {:select   [:status]
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
             :id [:in card-ids]))

(defn stale-dashboards
  "The listing columns of the Dashboards with `dashboard-ids`."
  [dashboard-ids]
  (t2/select [:model/Dashboard
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
             :id [:in dashboard-ids]))

(defn- stale-content-union
  "The union of `union-queries` (per-model SELECTs from `metabase.staleness.core/find-stale-query`),
  aliased for use as a `:from` source."
  [union-queries]
  [[^:allow-subquery {:union-all union-queries} :dummy_alias]])

(defn stale-content-rows
  "A page of `:id`/`:model` rows from the union of `union-queries`, sorted by `sort-column` (`:name` or
  `:last_used_at`) in `sort-direction`, skipping `offset` and returning up to `limit` (either may be nil for no
  restriction)."
  [union-queries sort-column sort-direction limit offset]
  (t2/query (cond-> {:select   [:id :model]
                     :from     (stale-content-union union-queries)
                     :order-by [[(case sort-column
                                   :name         :%lower.name
                                   :last_used_at :last_used_at)
                                 sort-direction]]}
              (some? limit)  (assoc :limit limit)
              (some? offset) (assoc :offset offset))))

(defn stale-content-count
  "The total count of rows across every page [[stale-content-rows]] would return for `union-queries`."
  [union-queries]
  (:count (t2/query-one {:select [[:%count.* :count]]
                         :from   (stale-content-union union-queries)})))
