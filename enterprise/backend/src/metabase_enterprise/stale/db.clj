(ns metabase-enterprise.stale.db
  "Application database queries for the stale module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [malli.util :as mut]
   [metabase.collections.schema :as collections.schema]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn collection :- [:maybe ::collections.schema/collection]
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection collection-id))

(mu/defn collections-by-id :- [:map-of ::lib.schema.id/collection ::collections.schema/collection]
  "A map of ID to Collection for `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (t2/select-pk->fn identity :model/Collection :id [:in collection-ids]))

(def ^:private StaleCard
  "Rows returned by [[stale-cards]]."
  (mut/merge (mut/select-keys ::queries.schema/card.row [:id :dashboard_id :description :collection_id :name :entity_id :archived
                                                         :collection_position :display :collection_preview :database_id
                                                         :dataset_query :card_schema :last_used_at])
             [:map
              [:location         :nil]
              [:moderated_status [:maybe :string]]]))

(mu/defn stale-cards :- [:sequential StaleCard]
  "The listing columns of the Cards with `card-ids`, with their latest moderation status."
  [card-ids :- [:set ::lib.schema.id/card]]
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

(def ^:private StaleDashboard
  "Rows returned by [[stale-dashboards]]."
  (mut/merge (mut/select-keys ::dashboards.schema/dashboard.row
                              [:id :description :collection_id :name :entity_id :archived :collection_position])
             [:map
              [:last_used_at [:maybe ms/TemporalInstant]]
              [:model        [:= "dashboard"]]
              [:dashboard_id :nil]
              [:location     :nil]
              [:database_id  :nil]]))

(mu/defn stale-dashboards :- [:sequential StaleDashboard]
  "The listing columns of the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:set ::lib.schema.id/dashboard]]
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

(def ^:private StaleContent
  "Rows returned by [[stale-content-rows]]."
  [:map {:closed true}
   [:id :int]
   [:model :string]])

(mu/defn stale-content-rows :- [:sequential StaleContent]
  "A page of `:id`/`:model` rows from the union of `union-queries`, sorted by `sort-column` (`:name` or
  `:last_used_at`) in `sort-direction`, skipping `offset` and returning up to `limit` (either may be nil for no
  restriction)."
  [union-queries :- [:sequential :map]
   sort-column :- [:enum :name :last_used_at]
   sort-direction :- [:enum :asc :desc]
   limit :- [:maybe :int]
   offset :- [:maybe :int]]
  (t2/query (cond-> {:select   [:id :model]
                     :from     (stale-content-union union-queries)
                     :order-by [[(case sort-column
                                   :name         :%lower.name
                                   :last_used_at :last_used_at)
                                 sort-direction]]}
              (some? limit)  (assoc :limit limit)
              (some? offset) (assoc :offset offset))))

(mu/defn stale-content-count :- ms/IntGreaterThanOrEqualToZero
  "The total count of rows across every page [[stale-content-rows]] would return for `union-queries`."
  [union-queries :- [:sequential :map]]
  (:count (t2/query-one {:select [[:%count.* :count]]
                         :from   (stale-content-union union-queries)})))
