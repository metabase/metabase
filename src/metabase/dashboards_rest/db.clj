(ns metabase.dashboards-rest.db
  "Application database queries for the dashboards REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn dashboards :- [:sequential (ms/InstanceOf :model/Dashboard)]
  "The archived or unarchived (`archived?`) Dashboards, restricted to those created by `creator-id` when given, in
  case-insensitive name order."
  [archived?  :- :boolean
   creator-id :- [:maybe ms/PositiveInt]]
  (t2/select :model/Dashboard {:where    [:and
                                          (when creator-id [:= :creator_id creator-id])
                                          [:= :archived archived?]]
                               :order-by [:%lower.name]}))

(mu/defn dashboard :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboard-parameters :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The id and parameters of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one [:model/Dashboard :id :parameters] dashboard-id))

(mu/defn dashboard-name-columns :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The name, description, and creator of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one [:model/Dashboard :name :description :creator_id] dashboard-id))

(mu/defn dashboard-public-uuid :- [:maybe :string]
  "The public uuid of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one-fn :public_uuid :model/Dashboard :id dashboard-id))

(mu/defn public-dashboards :- [:sequential (ms/InstanceOf :model/Dashboard)]
  "The name, id, and public uuid of the unarchived Dashboards that are publicly shared."
  []
  (t2/select [:model/Dashboard :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(mu/defn embeddable-dashboards :- [:sequential (ms/InstanceOf :model/Dashboard)]
  "The name and id of the unarchived Dashboards with embedding enabled."
  []
  (t2/select [:model/Dashboard :name :id], :enable_embedding true, :archived false))

(mu/defn insert-dashboard! :- (ms/InstanceOf :model/Dashboard)
  "Insert the Dashboard `row` and return the inserted instance."
  [row :- [:map {:closed true}
           [:name                :string]
           [:description         {:optional true} [:maybe :string]]
           [:parameters          {:optional true} :any]
           [:creator_id          {:optional true} ms/PositiveInt]
           [:cache_ttl           {:optional true} [:maybe ms/PositiveInt]]
           [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
           [:collection_position {:optional true} [:maybe ms/PositiveInt]]
           [:width               {:optional true} [:maybe [:or :keyword :string]]]]]
  (t2/insert-returning-instance! :model/Dashboard row))

(mu/defn update-dashboard! :- :int
  "Apply `changes` to the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt
   changes      :- [:map {:closed true}
                    [:description             {:optional true} [:maybe :string]]
                    [:position                {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
                    [:width                   {:optional true} [:maybe [:or :keyword :string]]]
                    [:collection_id           {:optional true} [:maybe ms/PositiveInt]]
                    [:collection_position     {:optional true} [:maybe ms/PositiveInt]]
                    [:cache_ttl               {:optional true} [:maybe ms/PositiveInt]]
                    [:archived_directly       {:optional true} [:maybe :boolean]]
                    [:embedding_type          {:optional true} [:maybe [:or :keyword :string]]]
                    [:name                    {:optional true} :string]
                    [:parameters              {:optional true} :any]
                    [:caveats                 {:optional true} [:maybe :string]]
                    [:points_of_interest      {:optional true} [:maybe :string]]
                    [:show_in_getting_started {:optional true} :boolean]
                    [:enable_embedding        {:optional true} :boolean]
                    [:embedding_params        {:optional true} :any]
                    [:archived                {:optional true} :boolean]
                    [:auto_apply_filters      {:optional true} :boolean]
                    [:public_uuid             {:optional true} [:maybe :string]]
                    [:made_public_by_id       {:optional true} [:maybe ms/PositiveInt]]]]
  (t2/update! :model/Dashboard dashboard-id changes))

(mu/defn delete-dashboard! :- :int
  "Delete the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt]
  (t2/delete! :model/Dashboard :id dashboard-id))

(mu/defn parameter-card-ids :- [:maybe [:sequential ms/PositiveInt]]
  "The Card ids of the ParameterCards of the `parameterized-object-type` with `parameterized-object-id`."
  [parameterized-object-type :- [:or :keyword :string]
   parameterized-object-id   :- ms/PositiveInt]
  (t2/select-fn-vec :card_id :model/ParameterCard
                    :parameterized_object_type parameterized-object-type
                    :parameterized_object_id   parameterized-object-id))

(mu/defn dashboard-card-ids :- [:maybe [:sequential [:maybe ms/PositiveInt]]]
  "The Card ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-fn-vec :card_id :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn dashboard-item-cards :- [:sequential :map]
  "The card items of the Dashboard with `dashboard-id`, for the `/:id/items` endpoint: id, name, description, entity
  id, collection position, display, collection preview, last-used-at, collection id, archived flags, database id,
  and moderated status. Paged by `limit`/`offset` when `paged?`."
  [dashboard-id :- ms/PositiveInt
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

(mu/defn dashboard-series-card-ids :- [:maybe [:sequential [:maybe ms/PositiveInt]]]
  "The Card ids of the DashboardCardSeries of the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-fn-vec :card_id :model/DashboardCardSeries
                    {:where [:in :dashboardcard_id
                             ^:allow-subquery {:select [:id]
                                               :from   [(t2/table-name :model/DashboardCard)]
                                               :where  [:= :dashboard_id dashboard-id]}]}))

(mu/defn dashboard-action-ids :- [:maybe [:sequential [:maybe ms/PositiveInt]]]
  "The Action ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-fn-vec :action_id :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn query-average-execution-times :- [:map-of bytes? [:maybe number?]]
  "A map of query hash to average execution time for the Queries with `query-hashes`."
  [query-hashes :- [:seqable bytes?]]
  (t2/select-fn->fn :query_hash :average_execution_time :model/Query :query_hash [:in query-hashes]))

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id))

(mu/defn card-query :- :any
  "The query of the Card with `card-id`, or nil (also nil for virtual dashcards, which have no Card id)."
  [card-id :- [:maybe ms/PositiveInt]]
  (t2/select-one-fn :dataset_query :model/Card :id card-id))

(mu/defn card-queries :- [:map-of ms/PositiveInt :any]
  "A map of Card id to query for the Cards with `card-ids`."
  [card-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn :dataset_query :model/Card :id [:in card-ids]))

(mu/defn unarchived-dashboard-question-exists? :- :boolean
  "Whether an unarchived Card internal to the Dashboard with `dashboard-id` exists."
  [dashboard-id :- ms/PositiveInt]
  (t2/exists? :model/Card :dashboard_id dashboard-id :archived false))

(mu/defn card-internal-to-other-dashboard-exists? :- :boolean
  "Whether any of the Cards with `card-ids` is internal to a Dashboard other than `dashboard-id`."
  [dashboard-id :- ms/PositiveInt
   card-ids     :- [:seqable ms/PositiveInt]]
  (t2/exists? :model/Card
              {:where [:and
                       [:not= :dashboard_id dashboard-id]
                       [:not= :dashboard_id nil]
                       [:in :id card-ids]]}))

(mu/defn insert-dashboard-tabs! :- [:sequential ms/PositiveInt]
  "Insert the DashboardTab `rows` and return their ids."
  [rows :- [:sequential [:map {:closed true}
                         [:dashboard_id ms/PositiveInt]
                         [:name         :string]
                         [:position     ms/IntGreaterThanOrEqualToZero]]]]
  (t2/insert-returning-pks! :model/DashboardTab rows))

(mu/defn collection :- [:maybe (ms/InstanceOf :model/Collection)]
  "The Collection with `collection-id`, or nil."
  [collection-id :- ms/PositiveInt]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn personal-collection-for-user :- [:maybe (ms/InstanceOf :model/Collection)]
  "The personal Collection of the User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one :model/Collection :personal_owner_id user-id))

(mu/defn dashcard :- [:maybe (ms/InstanceOf :model/DashboardCard)]
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ms/PositiveInt]
  (t2/select-one :model/DashboardCard dashcard-id))

(mu/defn dashcard-in-dashboard :- [:maybe (ms/InstanceOf :model/DashboardCard)]
  "The DashboardCard with `dashcard-id` on the Dashboard with `dashboard-id`, or nil."
  [dashcard-id  :- ms/PositiveInt
   dashboard-id :- ms/PositiveInt]
  (t2/select-one :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

(mu/defn dashcards-by-ids :- [:sequential (ms/InstanceOf :model/DashboardCard)]
  "The DashboardCards with `dashcard-ids`."
  [dashcard-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/DashboardCard :id [:in dashcard-ids]))

(mu/defn dashcard-parameter-mappings :- [:map-of ms/PositiveInt :any]
  "A map of DashboardCard id to parameter mappings for the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-pk->fn :parameter_mappings :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn dashcard-card-ids-by-id :- [:map-of ms/PositiveInt [:maybe ms/PositiveInt]]
  "A map of DashboardCard id to Card id for the DashboardCards with `dashcard-ids` of the Dashboard with
  `dashboard-id`."
  [dashboard-id :- ms/PositiveInt
   dashcard-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn :card_id :model/DashboardCard :dashboard_id dashboard-id :id [:in dashcard-ids]))

(mu/defn user-name-and-email :- [:maybe (ms/InstanceOf :model/User)]
  "The name and email of the User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one [:model/User :first_name :last_name :email] user-id))

(mu/defn user-names-and-emails :- [:sequential (ms/InstanceOf :model/User)]
  "The names and emails of the Users with `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/User :first_name :last_name :email] :id [:in user-ids]))

(mu/defn pulse-channels-for-pulse :- [:sequential (ms/InstanceOf :model/PulseChannel)]
  "The id, type, and details of the PulseChannels of the Pulse with `pulse-id`."
  [pulse-id :- ms/PositiveInt]
  (t2/select [:model/PulseChannel :id :channel_type :details] :pulse_id [:= pulse-id]))

(mu/defn pulse-channel-recipients :- [:sequential (ms/InstanceOf :model/PulseChannelRecipient)]
  "The PulseChannelRecipients of the PulseChannel with `pulse-channel-id`."
  [pulse-channel-id :- ms/PositiveInt]
  (t2/select :model/PulseChannelRecipient :pulse_channel_id pulse-channel-id))

(mu/defn unarchived-pulses-for-dashboard :- [:sequential (ms/InstanceOf :model/Pulse)]
  "The unarchived Pulses of the Dashboard with `dashboard-id`, in id order."
  [dashboard-id :- ms/PositiveInt]
  (t2/select :model/Pulse :dashboard_id dashboard-id :archived false {:order-by [[:id :asc]]}))
