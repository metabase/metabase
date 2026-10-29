(ns metabase.dashboards-rest.db
  "Application database queries for the dashboards REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn dashboards
  "The archived or unarchived (`archived?`) Dashboards, restricted to those created by `creator-id` when given, in
  case-insensitive name order."
  [archived?  :- :boolean
   creator-id :- [:maybe ::lib.schema.id/user]]
  (t2/select :model/Dashboard {:where    [:and
                                          (when creator-id [:= :creator_id creator-id])
                                          [:= :archived archived?]]
                               :order-by [:%lower.name]}))

(mu/defn public-dashboards
  "The name, id, and public uuid of the unarchived Dashboards that are publicly shared."
  []
  (t2/select [:model/Dashboard :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(mu/defn embeddable-dashboards
  "The name and id of the unarchived Dashboards with embedding enabled."
  []
  (t2/select [:model/Dashboard :name :id], :enable_embedding true, :archived false))

(mu/defn insert-dashboard!
  "Insert the Dashboard `row` and return the inserted instance."
  [row :- ::dashboards.schema/dashboard.update]
  (t2/insert-returning-instance! :model/Dashboard row))

(mu/defn update-dashboard!
  "Apply `changes` to the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard
   changes      :- ::dashboards.schema/dashboard.update]
  (t2/update! :model/Dashboard dashboard-id changes))

(mu/defn delete-dashboard!
  "Delete the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/delete! :model/Dashboard :id dashboard-id))

(mu/defn dashboard-card-ids
  "The Card ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-fn-vec :card_id :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn dashboard-item-cards
  "The card items of the Dashboard with `dashboard-id`, for the `/:id/items` endpoint: id, name, description, entity
  id, collection position, display, collection preview, last-used-at, collection id, archived flags, database id,
  and moderated status. Paged by `limit`/`offset` when `paged?`."
  [dashboard-id :- ::lib.schema.id/dashboard
   paged?       :- :boolean
   limit        :- [:maybe ms/PositiveInt]
   offset       :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (app-db/query
   (cond-> {:select [:c.id :c.name :c.description :c.entity_id :c.collection_position :c.display :c.collection_preview
                     :last_used_at :c.collection_id :c.archived_directly :c.archived :c.database_id
                     :c.dashboard_id
                     [nil :location]
                     [(h2x/literal "card") :model]
                     [^:allow-subquery {:select   [:status]
                                        :from     [:moderation_review]
                                        :where    [:and
                                                   [:= :moderated_item_type "card"]
                                                   [:= :moderated_item_id :c.id]
                                                   [:= :most_recent true]]
                                        ;; limit 1 to ensure that there is only one result but this invariant should
                                        ;; hold true, just protecting against potential bugs
                                        :order-by [[:id :desc]]
                                        :limit    1}
                      :moderated_status]]
            :from  [[:report_card :c]]
            :where [:and
                    [:= :c.dashboard_id dashboard-id]
                    [:exists ^:allow-subquery {:select 1
                                               :from   [[:report_dashboardcard :dc]]
                                               :where  [:and [:= :c.id :dc.card_id] [:= :c.dashboard_id :dc.dashboard_id]]}]
                    [:= :c.archived false]]}
     paged? (merge {:limit limit :offset offset}))))

(mu/defn dashboard-series-card-ids
  "The Card ids of the DashboardCardSeries of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-fn-vec :card_id :model/DashboardCardSeries
                    {:where [:in :dashboardcard_id
                             ^:allow-subquery {:select [:id]
                                               :from   [(t2/table-name :model/DashboardCard)]
                                               :where  [:= :dashboard_id dashboard-id]}]}))

(mu/defn dashboard-action-ids
  "The Action ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-fn-vec :action_id :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn insert-dashboard-tabs!
  "Insert the DashboardTab `rows` and return their ids."
  [rows :- [:sequential (mut/select-keys ::dashboards.schema/dashboard-tab.update [:dashboard_id :name :position])]]
  (t2/insert-returning-pks! :model/DashboardTab rows))

(mu/defn dashcards-by-ids
  "The DashboardCards with `dashcard-ids`."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/select :model/DashboardCard :id [:in dashcard-ids]))

(mu/defn dashcard-parameter-mappings
  "A map of DashboardCard id to parameter mappings for the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-pk->fn :parameter_mappings :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn dashcard-card-ids-by-id
  "A map of DashboardCard id to Card id for the DashboardCards with `dashcard-ids` of the Dashboard with
  `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard
   dashcard-ids :- [:set ::lib.schema.id/dashcard]]
  (t2/select-pk->fn :card_id :model/DashboardCard :dashboard_id dashboard-id :id [:in dashcard-ids]))
