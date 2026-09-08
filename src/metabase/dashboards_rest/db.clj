(ns metabase.dashboards-rest.db
  "Application database queries for the dashboards REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defn dashboards
  "The archived or unarchived (`archived?`) Dashboards, restricted to those created by `creator-id` when given, in
  case-insensitive name order."
  [archived? creator-id]
  (t2/select :model/Dashboard {:where    [:and
                                          (when creator-id [:= :creator_id creator-id])
                                          [:= :archived archived?]]
                               :order-by [:%lower.name]}))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard :id dashboard-id))

(defn dashboard-parameters
  "The id and parameters of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one [:model/Dashboard :id :parameters] dashboard-id))

(defn dashboard-name-columns
  "The name, description, and creator of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one [:model/Dashboard :name :description :creator_id] dashboard-id))

(defn dashboard-public-uuid
  "The public uuid of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one-fn :public_uuid :model/Dashboard :id dashboard-id))

(defn public-dashboards
  "The name, id, and public uuid of the unarchived Dashboards that are publicly shared."
  []
  (t2/select [:model/Dashboard :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(defn embeddable-dashboards
  "The name and id of the unarchived Dashboards with embedding enabled."
  []
  (t2/select [:model/Dashboard :name :id], :enable_embedding true, :archived false))

(defn insert-dashboard!
  "Insert the Dashboard `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Dashboard row))

(defn update-dashboard!
  "Apply `changes` to the Dashboard with `dashboard-id`."
  [dashboard-id changes]
  (t2/update! :model/Dashboard dashboard-id changes))

(defn delete-dashboard!
  "Delete the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/delete! :model/Dashboard :id dashboard-id))

(defn parameter-card-ids
  "The Card ids of the ParameterCards of the `parameterized-object-type` with `parameterized-object-id`."
  [parameterized-object-type parameterized-object-id]
  (t2/select-fn-vec :card_id :model/ParameterCard
                    :parameterized_object_type parameterized-object-type
                    :parameterized_object_id   parameterized-object-id))

(defn dashboard-card-ids
  "The Card ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-fn-vec :card_id :model/DashboardCard :dashboard_id dashboard-id))

(defn dashboard-item-cards
  "The card items of the Dashboard with `dashboard-id`, for the `/:id/items` endpoint: id, name, description, entity
  id, collection position, display, collection preview, last-used-at, collection id, archived flags, database id,
  and moderated status. Paged by `limit`/`offset` when `paged?`."
  [dashboard-id paged? limit offset]
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

(defn dashboard-series-card-ids
  "The Card ids of the DashboardCardSeries of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-fn-vec :card_id :model/DashboardCardSeries
                    {:where [:in :dashboardcard_id
                             ^:allow-subquery {:select [:id]
                                               :from   [(t2/table-name :model/DashboardCard)]
                                               :where  [:= :dashboard_id dashboard-id]}]}))

(defn dashboard-action-ids
  "The Action ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-fn-vec :action_id :model/DashboardCard :dashboard_id dashboard-id))

(defn query-average-execution-times
  "A map of query hash to average execution time for the Queries with `query-hashes`."
  [query-hashes]
  (t2/select-fn->fn :query_hash :average_execution_time :model/Query :query_hash [:in query-hashes]))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn card-query
  "The query of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one-fn :dataset_query :model/Card :id card-id))

(defn card-queries
  "A map of Card id to query for the Cards with `card-ids`."
  [card-ids]
  (t2/select-pk->fn :dataset_query :model/Card :id [:in card-ids]))

(defn unarchived-dashboard-question-exists?
  "Whether an unarchived Card internal to the Dashboard with `dashboard-id` exists."
  [dashboard-id]
  (t2/exists? :model/Card :dashboard_id dashboard-id :archived false))

(defn card-internal-to-other-dashboard-exists?
  "Whether any of the Cards with `card-ids` is internal to a Dashboard other than `dashboard-id`."
  [dashboard-id card-ids]
  (t2/exists? :model/Card
              {:where [:and
                       [:not= :dashboard_id dashboard-id]
                       [:not= :dashboard_id nil]
                       [:in :id card-ids]]}))

(defn insert-dashboard-tabs!
  "Insert the DashboardTab `rows` and return their ids."
  [rows]
  (t2/insert-returning-pks! :model/DashboardTab rows))

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection :id collection-id))

(defn personal-collection-for-user
  "The personal Collection of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one :model/Collection :personal_owner_id user-id))

(defn dashcard
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id]
  (t2/select-one :model/DashboardCard dashcard-id))

(defn dashcard-in-dashboard
  "The DashboardCard with `dashcard-id` on the Dashboard with `dashboard-id`, or nil."
  [dashcard-id dashboard-id]
  (t2/select-one :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

(defn dashcards-by-ids
  "The DashboardCards with `dashcard-ids`."
  [dashcard-ids]
  (t2/select :model/DashboardCard :id [:in dashcard-ids]))

(defn dashcard-parameter-mappings
  "A map of DashboardCard id to parameter mappings for the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-pk->fn :parameter_mappings :model/DashboardCard :dashboard_id dashboard-id))

(defn dashcard-card-ids-by-id
  "A map of DashboardCard id to Card id for the DashboardCards with `dashcard-ids` of the Dashboard with
  `dashboard-id`."
  [dashboard-id dashcard-ids]
  (t2/select-pk->fn :card_id :model/DashboardCard :dashboard_id dashboard-id :id [:in dashcard-ids]))

(defn user-name-and-email
  "The name and email of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one [:model/User :first_name :last_name :email] user-id))

(defn user-names-and-emails
  "The names and emails of the Users with `user-ids`."
  [user-ids]
  (t2/select [:model/User :first_name :last_name :email] :id [:in user-ids]))

(defn pulse-channels-for-pulse
  "The id, type, and details of the PulseChannels of the Pulse with `pulse-id`."
  [pulse-id]
  (t2/select [:model/PulseChannel :id :channel_type :details] :pulse_id [:= pulse-id]))

(defn pulse-channel-recipients
  "The PulseChannelRecipients of the PulseChannel with `pulse-channel-id`."
  [pulse-channel-id]
  (t2/select :model/PulseChannelRecipient :pulse_channel_id pulse-channel-id))

(defn unarchived-pulses-for-dashboard
  "The unarchived Pulses of the Dashboard with `dashboard-id`, in id order."
  [dashboard-id]
  (t2/select :model/Pulse :dashboard_id dashboard-id :archived false {:order-by [[:id :asc]]}))
