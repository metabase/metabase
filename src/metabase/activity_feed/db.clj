(ns metabase.activity-feed.db
  "Application database queries for the activity feed module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defn recent-cards
  "The recently viewed Cards with `ids`, with their Collection and Dashboard names."
  [ids]
  (t2/select [:model/Card
              :id :name :collection_id :description :display
              :dataset_query :type :archived :card_schema
              :collection.authority_level [:collection.name :collection_name]
              [:dashboard.name :dashboard_name] :dashboard_id]
             {:where     [:in :report_card.id ids]
              :left-join [:collection [:= :collection.id :report_card.collection_id]
                          [:report_dashboard :dashboard] [:= :dashboard.id :report_card.dashboard_id]]}))

(defn recent-dashboards
  "The recently viewed Dashboards with `ids`, with their Collection names."
  [ids]
  (t2/select [:model/Dashboard
              :id :name :collection_id :description
              :archived
              :collection.authority_level [:collection.name :collection_name]]
             {:where     [:in :report_dashboard.id ids]
              :left-join [:collection [:= :collection.id :report_dashboard.collection_id]]}))

(defn recent-tables
  "The recently viewed Tables with `ids`, with their Database names and sync status."
  [ids]
  (t2/select [:model/Table
              :id :name :db_id :active
              :display_name [:metabase_database.initial_sync_status :initial-sync-status]
              [:visibility_type :visibility_type]
              [:metabase_database.name :database-name]]
             {:where     [:in :metabase_table.id ids]
              :left-join [:metabase_database [:= :metabase_database.id :metabase_table.db_id]]}))

(defn recent-dashboard-and-table-views
  "Up to `limit` most recently viewed unarchived, active Dashboards and Tables with their view counts and last
  viewer."
  [limit]
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
                          [:metabase_table :t]
                          [:and
                           [:= :model "table"]
                           [:= :t.id :model_id]]]}))

(defn recent-card-runs
  "Up to `limit` most recently run question Cards with their run counts and last runner."
  [limit]
  (t2/select [:model/QueryExecution
              [:%min.executor_id :user_id]
              [:query_execution.card_id :model_id]
              [:%count.* :cnt]
              [:%max.started_at :max_ts]]
             {:group-by [:query_execution.card_id :context]
              :where    [:and
                         [:= :context (h2x/literal :question)]]
              :order-by [[:max_ts :desc]]
              :limit    limit}))

(defn entity-exists?
  "Whether a `model` row with `id` exists."
  [model id]
  (t2/exists? model :id id))

(defn entity
  "The `model` row with `id`, or nil."
  [model id]
  (t2/select-one model :id id))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard :id dashboard-id))

(defn card-document-id
  "The Document id of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one-fn :document_id :model/Card :id card-id))

(defn recent-views-for-user-context
  "The RecentViews of the User with `user-id` in `context`, newest first."
  [user-id context]
  (t2/select :model/RecentViews :user_id user-id :context context {:order-by [[:timestamp :desc]]}))

(defn recent-view-ids-to-prune
  "The ids of the RecentViews of the User with `user-id` for `db-model` in `context` beyond the newest `keep` of
  them, restricted to the Cards of `card-type` when non-nil."
  [db-model user-id context card-type keep]
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

(defn insert-recent-views!
  "Insert the RecentViews `rows`."
  [rows]
  (t2/insert! :model/RecentViews rows))

(defn delete-recent-views!
  "Delete the RecentViews with `ids`."
  [ids]
  (t2/delete! :model/RecentViews :id [:in ids]))

(defn most-recently-viewed-dashboard-id
  "The id of the unarchived Dashboard the User with `user-id` viewed most recently after `since`, or nil."
  [user-id since]
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

(defn cards-for-recent-views
  "The Cards with `card-ids` with their Dashboard, Collection, and moderation status."
  [card-ids]
  (t2/select :model/Card
             {:select [:card.name
                       :card.description
                       :card.archived
                       :card.id
                       :card.database_id
                       :card.display
                       :card.card_schema
                       :card.result_metadata
                       :card.dataset_query
                       :card.entity_id
                       :card.visualization_settings
                       [:dashboard.id :dashboard_id]
                       [:dashboard.name :dashboard_name]
                       [:card.collection_id :entity-coll-id]
                       [:mr.status :moderated-status]
                       [:collection.id :collection_id]
                       [:collection.name :collection_name]
                       [:collection.authority_level :collection_authority_level]]
              :from [[:report_card :card]]
              :where [:in :card.id card-ids]
              :left-join [[:moderation_review :mr]
                          [:and
                           [:= :mr.moderated_item_id :card.id]
                           [:= :mr.moderated_item_type "card"]
                           [:= :mr.most_recent true]]
                          [:collection]
                          [:and
                           [:= :collection.id :card.collection_id]
                           [:= :collection.archived false]]
                          [:report_dashboard :dashboard]
                          [:= :dashboard.id :card.dashboard_id]]}))

(defn dashboards-for-recent-views
  "The Dashboards with `dashboard-ids` with their Collection and moderation status."
  [dashboard-ids]
  (t2/select :model/Dashboard
             {:select [:dash.id
                       :dash.name
                       :dash.description
                       :dash.archived
                       [:dash.collection_id :entity-coll-id]
                       [:c.id :collection_id]
                       [:c.name :collection_name]
                       [:c.authority_level :collection_authority_level]
                       [:mr.status :moderated-status]]
              :from [[:report_dashboard :dash]]
              :where [:in :dash.id dashboard-ids]
              :left-join [[:moderation_review :mr]
                          [:and
                           [:= :mr.moderated_item_id :dash.id]
                           [:= :mr.moderated_item_type "dashboard"]
                           [:= :mr.most_recent true]]
                          [:collection :c]
                          [:and
                           [:= :c.id :dash.collection_id]
                           [:= :c.archived false]]]}))

(defn unarchived-collections-with-details
  "The unarchived Collections with `collection-ids`, with their location, type, and authority level."
  [collection-ids]
  (t2/select :model/Collection
             {:select [:id :name :description :authority_level
                       :archived :location :type]
              :where [:and
                      [:in :id collection-ids]
                      [:= :archived false]]}))

(defn visible-tables-for-recent-views
  "The non-hidden Tables with `table-ids` with their Database name and sync status."
  [table-ids]
  (t2/select :model/Table
             {:select [:t.id :t.name :t.description
                       :t.display_name :t.active :t.visibility_type :t.schema
                       [:db.name :database-name]
                       [:db.id :db_id]
                       [:db.initial_sync_status :initial-sync-status]]
              :from [[:metabase_table :t]]
              :where [:and
                      [:or
                       [:= :visibility_type nil]
                       [:!= :visibility_type "hidden"]]
                      [:in :t.id table-ids]]
              :left-join [[:metabase_database :db]
                          [:= :db.id :t.db_id]]}))

(defn recent-views-with-card-type
  "The RecentViews of the User with `user-id` in `contexts`, newest first, with the type of the viewed Card. Narrowed
  to `db-models` and to the Cards of `card-types` when given; excludes trashed and namespaced Collections, exploration
  Documents, and, when `selections?`, the instance analytics Collection."
  [user-id contexts db-models card-types selections?]
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

(defn documents-for-recent-views
  "The Documents with `document-ids` with their Collection."
  [document-ids]
  (t2/select :model/Document
             {:select [:d.id
                       :d.name
                       :d.archived
                       [:d.collection_id :entity-coll-id]
                       [:c.id :collection_id]
                       [:c.name :collection_name]
                       [:c.authority_level :collection_authority_level]]
              :from [[:document :d]]
              :where [:in :d.id document-ids]
              :left-join [[:collection :c]
                          [:and
                           [:= :c.id :d.collection_id]
                           [:= :c.archived false]]]}))
