(ns metabase.activity-feed.db
  "Application database queries for the activity feed module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.activity-feed.schema :as activity-feed.schema]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn recent-dashboard-and-table-views
  "Up to `limit` most recently viewed unarchived, active Dashboards and Tables with their view counts and last
  viewer."
  [limit :- ms/PositiveInt]
  (t2/select [:model/RecentViews
              [[:min :recent_views.user_id] :user_id]
              :model
              :model_id
              [[:max [:coalesce :d.view_count :t.view_count]] :cnt]
              [:%max.timestamp :max_ts]]
             {:group-by  [:model :model_id]
              :where     [:and
                          [:= :context "view"]
                          [:in :model #{"dashboard" "table"}]
                          [:or [:= :active true] [:= :active nil]]
                          [:or [:= :archived false] [:= :archived nil]]]
              :order-by  [[:max_ts :desc] [:model :desc]]
              :limit     limit
              :left-join [[:report_dashboard :d]
                          [:and
                           [:= :model "dashboard"]
                           [:= :d.id :model_id]]
                          (warehouse-schema-overlay/table-query {:alias :t})
                          [:and
                           [:= :model "table"]
                           [:= :t.id :model_id]]]}))

(mu/defn recent-views-for-user-context
  "The RecentViews of the User with `user-id` in `context`, newest first."
  [user-id :- ::lib.schema.id/user
   context :- [:or :keyword :string]]
  (t2/select :model/RecentViews :user_id user-id :context context {:order-by [[:timestamp :desc]]}))

(mu/defn recent-view-ids-to-prune
  "The ids of the RecentViews of the User with `user-id` for `db-model` in `context` beyond the newest `keep` of
  them, restricted to the Cards of `card-type` when non-nil."
  [db-model  :- :string
   user-id   :- ::lib.schema.id/user
   context   :- :string
   card-type :- [:maybe :string]
   keep      :- ms/IntGreaterThanOrEqualToZero]
  (t2/select-fn-set :id
                    :model/RecentViews
                    {:select [:rv.id]
                     :from [[:recent_views :rv]]
                     :where [:and
                             [:= :rv.model db-model]
                             [:= :rv.user_id user-id]
                             [:= :rv.context (h2x/literal context)]
                             (when card-type
                               [:= :rc.type (h2x/literal card-type)])]
                     :left-join [[:report_card :rc]
                                 [:and
                                  [:= :rc.id :rv.model_id]
                                  [:= :rv.model (h2x/literal "card")]]]
                     :order-by [[:rv.timestamp :desc]]
                     ;; mysql doesn't support offset without limit :derp:
                     :limit 100000
                     :offset keep}))

(mu/defn insert-recent-views!
  "Insert the RecentViews `rows`."
  [rows :- [:sequential ::activity-feed.schema/recent-views.update]]
  (t2/insert! :model/RecentViews rows))

(mu/defn delete-recent-views!
  "Delete the RecentViews with `ids`."
  [ids :- [:set ms/PositiveInt]]
  (t2/delete! :model/RecentViews :id [:in ids]))

(mu/defn most-recently-viewed-dashboard-id
  "The id of the unarchived Dashboard the User with `user-id` viewed most recently after `since`, or nil."
  [user-id :- ::lib.schema.id/user
   since   :- ms/TemporalInstant]
  (t2/select-one-fn
   :model_id
   :model/RecentViews
   {:where    [:and
               [:= :user_id user-id]
               [:= :model (h2x/literal "dashboard")]
               [:> :timestamp since]
               [:not= :d.archived true]]
    :order-by [[:recent_views.id :desc]]
    :left-join [[:report_dashboard :d]
                [:= :recent_views.model_id :d.id]]}))

(mu/defn recent-views-with-card-type
  "The RecentViews of the User with `user-id` in `contexts`, newest first, with the type of the viewed Card. Narrowed
  to `db-models` and to the Cards of `card-types` when given; excludes trashed and namespaced Collections, exploration
  Documents, and, when `selections?`, the instance analytics Collection."
  [user-id     :- ::lib.schema.id/user
   contexts    :- [:sequential :string]
   db-models   :- [:maybe [:sequential :string]]
   card-types  :- [:sequential :string]
   selections? :- :boolean]
  (t2/select :model/RecentViews
             {:select    [:rv.* [:rc.type :card_type]]
              :from      [[:recent_views :rv]]
              :where     [:and
                          [:= :rv.user_id user-id]
                          [:in :rv.context contexts]
                          (when (seq db-models)
                            [:in :rv.model db-models])
                          ;; Additionally filter by card type to distinguish questions/models/metrics
                          (when (seq card-types)
                            [:or
                             [:!= :rv.model "card"]
                             [:in :rc.type (map h2x/literal card-types)]])
                          ;; include non-collections, or collections without a namespace/type.
                          [:or
                           [:= :coll.id nil]
                           [:and
                            ;; trash collection is never returned
                            [:or [:= nil :coll.type] [:not= :coll.type collection/trash-collection-type]]
                            ;; collections in a different namespace can't interact with collections
                            ;; in the normal NULL namespace.
                            [:= nil :coll.namespace]
                            ;; exclude instance analytics for selects
                            (when selections?
                              [:or [:= nil :coll.type] [:not= :coll.type collection/instance-analytics-collection-type]])]]
                          ;; exploration documents are accessible only through their owning Exploration;
                          ;; hide them from recents to match search and collection-listing behavior.
                          [:or [:!= :rv.model "document"] [:= :doc.exploration_id nil]]]
              :left-join [[:report_card :rc]
                          [:and
                           ;; only want to join on card_type if it's a card
                           [:= :rv.model "card"]
                           [:= :rc.id :rv.model_id]]
                          [:collection :coll]
                          [:and
                           [:= :rv.model "collection"]
                           [:= :coll.id :rv.model_id]]
                          [:document :doc]
                          [:and
                           [:= :rv.model "document"]
                           [:= :doc.id :rv.model_id]]]
              :order-by  [[:rv.timestamp :desc]]}))
