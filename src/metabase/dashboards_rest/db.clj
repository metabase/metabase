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
  case-insensitive name order. `worktree-id` selects the Dashboards checked out into that remote-sync worktree; nil
  (the default) selects the main app's."
  ([archived?  :- :boolean
    creator-id :- [:maybe ::lib.schema.id/user]]
   (dashboards archived? creator-id nil))
  ([archived?   :- :boolean
    creator-id  :- [:maybe ::lib.schema.id/user]
    worktree-id :- [:maybe ::lib.schema.id/worktree]]
   (t2/select :model/Dashboard {:where    [:and
                                           (when creator-id [:= :creator_id creator-id])
                                           [:= :archived archived?]
                                           [:= :worktree_id worktree-id]]
                                :order-by [:%lower.name]})))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboard-parameters
  "The id and parameters of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one [:model/Dashboard :id :parameters] dashboard-id))

(mu/defn dashboard-name-columns
  "The name, description, and creator of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one [:model/Dashboard :name :description :creator_id] dashboard-id))

(mu/defn dashboard-public-uuid
  "The public uuid of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :public_uuid :model/Dashboard :id dashboard-id))

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

(mu/defn parameter-card-ids
  "The Card ids of the ParameterCards of the `parameterized-object-type` with `parameterized-object-id`."
  [parameterized-object-type :- [:or :keyword :string]
   parameterized-object-id   :- ms/PositiveInt]
  (t2/select-fn-vec :card_id :model/ParameterCard
                    :parameterized_object_type parameterized-object-type
                    :parameterized_object_id   parameterized-object-id))

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

(mu/defn query-average-execution-times
  "A map of query hash to average execution time for the Queries with `query-hashes`."
  [query-hashes :- [:sequential bytes?]]
  (t2/select-fn->fn :query_hash :average_execution_time :model/Query :query_hash [:in query-hashes]))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn card-query
  "The query of the Card with `card-id`, or nil (also nil for virtual dashcards, which have no Card id)."
  [card-id :- [:maybe ::lib.schema.id/card]]
  (t2/select-one-fn :dataset_query :model/Card :id card-id))

(mu/defn card-queries
  "A map of Card id to query for the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select-pk->fn :dataset_query :model/Card :id [:in card-ids]))

(mu/defn unarchived-dashboard-question-exists?
  "Whether an unarchived Card internal to the Dashboard with `dashboard-id` exists."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/exists? :model/Card :dashboard_id dashboard-id :archived false))

(mu/defn card-internal-to-other-dashboard-exists?
  "Whether any of the Cards with `card-ids` is internal to a Dashboard other than `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard
   card-ids     :- [:set ::lib.schema.id/card]]
  (t2/exists? :model/Card
              {:where [:and
                       [:not= :dashboard_id dashboard-id]
                       [:not= :dashboard_id nil]
                       [:in :id card-ids]]}))

(mu/defn insert-dashboard-tabs!
  "Insert the DashboardTab `rows` and return their ids."
  [rows :- [:sequential (mut/select-keys ::dashboards.schema/dashboard-tab.update [:dashboard_id :name :position])]]
  (t2/insert-returning-pks! :model/DashboardTab rows))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn personal-collection-for-user
  "The personal Collection of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/Collection :personal_owner_id user-id))

(mu/defn dashcard
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one :model/DashboardCard dashcard-id))

(mu/defn dashcard-in-dashboard
  "The DashboardCard with `dashcard-id` on the Dashboard with `dashboard-id`, or nil."
  [dashcard-id  :- ::lib.schema.id/dashcard
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

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

(mu/defn user-name-and-email
  "The name and email of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :first_name :last_name :email] user-id))

(mu/defn user-names-and-emails
  "The names and emails of the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select [:model/User :first_name :last_name :email] :id [:in user-ids]))

(mu/defn pulse-channels-for-pulse
  "The id, type, and details of the PulseChannels of the Pulse with `pulse-id`."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select [:model/PulseChannel :id :channel_type :details] :pulse_id [:= pulse-id]))

(mu/defn pulse-channel-recipients
  "The PulseChannelRecipients of the PulseChannel with `pulse-channel-id`."
  [pulse-channel-id :- ms/PositiveInt]
  (t2/select :model/PulseChannelRecipient :pulse_channel_id pulse-channel-id))

(mu/defn unarchived-pulses-for-dashboard
  "The unarchived Pulses of the Dashboard with `dashboard-id`, in id order."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/Pulse :dashboard_id dashboard-id :archived false {:order-by [[:id :asc]]}))
