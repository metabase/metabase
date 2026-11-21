(ns metabase.pulse.db
  "Application database queries for the pulse module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.change-log.core :as change-log]
   [metabase.collections.listing :as collections.listing]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id [:auto/param card-id]))

(mu/defn cards
  "The Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (if (seq card-ids)
    (t2/select :model/Card :id [:in card-ids])
    []))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn card-query
  "The query of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  ;; Written out by hand rather than using `metabase.queries.core/card-query-info`: `queries` already uses
  ;; `pulse`, so requiring it back would add a module cycle for one query. Keep in sync with
  ;; `metabase.queries.card-schema/schema-upgrade-triggers`.
  (t2/select-one-fn :dataset_query
                    [:model/Card :id :dataset_query :card_schema :type :entity_id
                     :result_metadata :dimensions :dimension_mappings]
                    :id [:auto/param card-id]))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil. `dashboard-id` may be nil (e.g. a legacy Pulse with no Dashboard), in
  which case the result is nil."
  [dashboard-id :- [:maybe ::lib.schema.id/dashboard]]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboard-archived? :- :boolean
  "Whether the Dashboard with `dashboard-id` exists and is archived."
  [dashboard-id :- [:maybe ::lib.schema.id/dashboard]]
  (t2/exists? :model/Dashboard :id dashboard-id :archived true))

(mu/defn dashboard-collection-id
  "The Collection id of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :collection_id :model/Dashboard, :id dashboard-id))

(mu/defn dashboards-by-id
  "The `:id`, `:name` and `:collection_id` of the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential {:min 1} ::lib.schema.id/dashboard]]
  (t2/select [:model/Dashboard :id :name :collection_id] :id [:in dashboard-ids]))

(mu/defn subscriptions-for-dashboards
  "The `:dashboard-id`, `:pulse-id`, `:name` and `:collection-id` of each Pulse (subscription) attached to one of the
  Dashboards with `dashboard-ids`, with the `:card-id` of each of its PulseCards, nil for a Pulse that has none."
  [dashboard-ids :- [:sequential {:min 1} ::lib.schema.id/dashboard]]
  (app-db/query {:select-distinct [[:p.dashboard_id :dashboard-id] [:p.id :pulse-id] [:p.name :name]
                                   [:p.collection_id :collection-id] [:pc.card_id :card-id]]
                 :from            [[:pulse :p]]
                 :left-join       [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
                 :where           [:in :p.dashboard_id dashboard-ids]}))

(mu/defn dashcards-with-cards-for-dashboards
  "The `:id`, `:dashboard_id` and `:card_id` of the DashboardCards showing a Card on the Dashboards with
  `dashboard-ids`, in id order."
  [dashboard-ids :- [:sequential {:min 1} ::lib.schema.id/dashboard]]
  (app-db/query {:select   [:dc.id :dc.dashboard_id :dc.card_id]
                 :from     [[:report_dashboardcard :dc]]
                 :where    [:and
                            [:in :dc.dashboard_id dashboard-ids]
                            [:not= :dc.card_id nil]]
                 :order-by [[:dc.id :asc]]}))

(mu/defn channel
  "The Channel with `channel-id`, or nil."
  [channel-id :- ms/PositiveInt]
  (t2/select-one :model/Channel :id channel-id))

(mu/defn active-http-channel-exists?
  "Whether an active HTTP Channel exists."
  []
  (t2/exists? :model/Channel :type :channel/http :active true))

(mu/defn superusers
  "The superusers."
  []
  (t2/select :model/User :is_superuser true))

(mu/defn user-emails-by-id
  "A map of User id to email for the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn :email :model/User, :id [:in user-ids]))

(mu/defn pulse
  "The Pulse with `pulse-id`, or nil."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select-one :model/Pulse :id pulse-id))

(mu/defn pulses-for-dashboard
  "The Pulses of the Dashboard with `dashboard-id`, archived or not."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/Pulse :dashboard_id dashboard-id))

(mu/defn pulse-id
  "The id of the Pulse with `pulse-id` if it exists, or nil."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select-one-pk :model/Pulse :id pulse-id))

(mu/defn pulse-id-of-channel
  "The id of the Pulse of the PulseChannel with `pulse-channel-id`, or nil."
  [pulse-channel-id :- ms/PositiveInt]
  (t2/select-one-fn :pulse_id :model/PulseChannel :id [:auto/param pulse-channel-id]))

(mu/defn unarchived-pulse
  "The unarchived Pulse with `pulse-id`, or nil."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select-one :model/Pulse :id pulse-id :archived false))

(mu/defn unarchived-non-alert-pulse
  "The unarchived, non-alert Pulse with `pulse-id`, or nil."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select-one :model/Pulse :id pulse-id :archived false :alert_condition nil))

(mu/defn alert
  "The Pulse with `pulse-id` if it is an alert, or nil."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select-one :model/Pulse, :id pulse-id, :alert_condition [:not= nil]))

(mu/defn alerts
  "The alert-type Pulses (unarchived unless `archived?`), optionally narrowed to those with a recipient or creator
  `user-id`, ordered by lower-cased name."
  [archived? :- :boolean
   user-id   :- [:maybe ::lib.schema.id/user]]
  (t2/select :model/Pulse
             (merge {:select-distinct [:p.* [[:lower :p.name] :lower-name]]
                     :from            [[:pulse :p]]
                     :where           [:and
                                       [:not= :p.alert_condition nil]
                                       [:= :p.archived archived?]
                                       (when user-id
                                         [:or
                                          [:= :p.creator_id user-id]
                                          [:= :pcr.user_id user-id]])]
                     :order-by        [[:lower-name :asc]]}
                    (when user-id
                      {:left-join [[:pulse_channel :pchan] [:= :p.id :pchan.pulse_id]
                                   [:pulse_channel_recipient :pcr] [:= :pchan.id :pcr.pulse_channel_id]]}))))

(mu/defn pulses
  "The dashboard-subscription Pulses (unarchived unless `archived?`), optionally narrowed to `dashboard-id` and/or
  those with a recipient or creator `user-id`, ordered by lower-cased name."
  [archived?    :- :boolean
   dashboard-id :- [:maybe ::lib.schema.id/dashboard]
   user-id      :- [:maybe ::lib.schema.id/user]]
  (t2/select :model/Pulse
             {:select-distinct [:p.* [[:lower :p.name] :lower-name]]
              :from            [[:pulse :p]]
              :left-join       (concat
                                [[:report_dashboard :d] [:= :p.dashboard_id :d.id]]
                                (when user-id
                                  [[:pulse_channel :pchan]         [:= :p.id :pchan.pulse_id]
                                   [:pulse_channel_recipient :pcr] [:= :pchan.id :pcr.pulse_channel_id]]))
              :where           [:and
                                [:= :p.alert_condition nil]
                                [:= :p.archived archived?]
                                [:or
                                 [:= :p.dashboard_id nil]
                                 [:= :d.archived false]]
                                (when dashboard-id
                                  [:= :p.dashboard_id dashboard-id])
                                (when user-id
                                  [:and
                                   [:not= :p.dashboard_id nil]
                                   [:or
                                    [:= :p.creator_id user-id]
                                    [:= :pcr.user_id user-id]]])]
              :order-by        [[:lower-name :asc]]}))

(mu/defn alerts-for-card-and-user
  "The alert-type Pulses (unarchived unless `archived?`) on the Card with `card-id` that the User with `user-id` is
  set to receive."
  [card-id   :- ::lib.schema.id/card
   user-id   :- ::lib.schema.id/user
   archived? :- :boolean]
  (t2/select :model/Pulse
             {:select [:p.*]
              :from   [[:pulse :p]]
              :join   [[:pulse_card :pc] [:= :p.id :pc.pulse_id]
                       [:pulse_channel :pchan] [:= :pchan.pulse_id :p.id]
                       [:pulse_channel_recipient :pcr] [:= :pchan.id :pcr.pulse_channel_id]]
              :where  [:and
                       [:not= :p.alert_condition nil]
                       [:= :pc.card_id card-id]
                       [:= :pcr.user_id user-id]
                       [:= :p.archived archived?]]}))

(mu/defn alerts-for-cards
  "The alert-type Pulses (unarchived unless `archived?`) on any of the Cards with `card-ids`."
  [card-ids  :- [:sequential ::lib.schema.id/card]
   archived? :- :boolean]
  (t2/select :model/Pulse
             {:select [:p.*]
              :from   [[:pulse :p]]
              :join   [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
              :where  [:and
                       [:not= :p.alert_condition nil]
                       [:in :pc.card_id card-ids]
                       [:= :p.archived archived?]]}))

(mu/defn legacy-pulse-count
  "The number of unarchived Pulses that are neither dashboard subscriptions nor alerts."
  []
  (t2/count :model/Pulse :dashboard_id nil :alert_condition nil :archived false))

(mu/defn legacy-pulses
  "The unarchived Pulses that are neither dashboard subscriptions nor alerts."
  []
  (t2/select :model/Pulse :dashboard_id nil :alert_condition nil :archived false))

(mu/defn insert-pulse!
  "Insert the Pulse `pulse` and return the inserted instance."
  [pulse :- ::pulse.schema/pulse.update]
  (t2/insert-returning-instance! :model/Pulse pulse))

(mu/defn update-pulse!
  "Apply `changes` to the Pulse with `pulse-id`."
  [pulse-id :- ::lib.schema.id/pulse
   changes  :- ::pulse.schema/pulse.update]
  (t2/update! :model/Pulse :id pulse-id changes))

(mu/defn update-pulses!
  "Apply `changes` to the Pulses with `pulse-ids`."
  [pulse-ids :- [:sequential ::lib.schema.id/pulse]
   changes   :- ::pulse.schema/pulse.update]
  (t2/update! :model/Pulse :id [:in pulse-ids] changes))

(mu/defn delete-pulses!
  "Delete the Pulses with `pulse-ids`."
  [pulse-ids :- [:sequential ::lib.schema.id/pulse]]
  (t2/delete! :model/Pulse :id [:in pulse-ids]))

(mu/defn update-pulses-for-dashboard!
  "Apply `changes` to the Pulses of the Dashboard with `dashboard-id`, leaving `updated_at` untouched."
  [dashboard-id :- ::lib.schema.id/dashboard
   changes      :- ::pulse.schema/pulse.update]
  (t2/update! :model/Pulse {:dashboard_id dashboard-id} (assoc changes :updated_at :updated_at)))

(mu/defn pulse-cards-for-pulses
  "The non-archived Cards of the Pulses with `pulse-ids` together with their PulseCard options, in position order."
  [pulse-ids :- [:sequential ::lib.schema.id/pulse]]
  (t2/select
   :model/Card
   {:select    [:c.id :c.name :c.description :c.collection_id :c.display :pc.include_csv :pc.include_xls :pc.format_rows :pc.pivot_results
                :pc.dashboard_card_id :dc.dashboard_id [nil :parameter_mappings] [:p.id :pulse_id]] ;; :dc.parameter_mappings - how do you select this?
    :from      [[:pulse :p]]
    :join      [[:pulse_card :pc] [:= :p.id :pc.pulse_id]
                [:report_card :c] [:= :c.id :pc.card_id]]
    :left-join [[:report_dashboardcard :dc] [:= :pc.dashboard_card_id :dc.id]]
    :where     [:and
                [:in :p.id pulse-ids]
                [:= :c.archived false]]
    :order-by [[:pc.position :asc]]}))

(mu/defn pulse-card-refs
  "The Card id (as `:id`), export options, and DashboardCard id of the PulseCards of the Pulse with `pulse-id`, in
  position order."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select [:model/PulseCard [:card_id :id] :include_csv :include_xls :dashboard_card_id]
             :pulse_id pulse-id
             {:order-by [[:position :asc]]}))

(mu/defn max-pulse-card-position
  "The `:max` position of the PulseCards of the Pulse with `pulse-id`."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select-one [:model/PulseCard [:%max.position :max]] :pulse_id pulse-id))

(mu/defn max-pulse-card-positions
  "A map of Pulse id to the largest position of its PulseCards, for the Pulses among `pulse-ids` that have any."
  [pulse-ids :- [:sequential {:min 1} ::lib.schema.id/pulse]]
  (into {}
        (map (juxt :pulse_id :max))
        (app-db/query {:select   [:pulse_id [:%max.position :max]]
                       :from     [:pulse_card]
                       :where    [:in :pulse_id pulse-ids]
                       :group-by [:pulse_id]})))

(mu/defn insert-pulse-cards!
  "Insert the PulseCard `rows`."
  [rows :- [:sequential ::pulse.schema/pulse-card.update]]
  (t2/insert! :model/PulseCard rows))

(mu/defn delete-pulse-cards-for-dashcards!
  "Delete the PulseCards of the DashboardCards with `dashcard-ids`, returning the number deleted."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/delete! :model/PulseCard :dashboard_card_id [:in dashcard-ids]))

(mu/defn delete-pulse-cards-for-pulse!
  "Delete the PulseCards of the Pulse with `pulse-id`."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/delete! :model/PulseCard :pulse_id pulse-id))

(mu/defn pulse-channels-for-pulse
  "The PulseChannels of the Pulse with `pulse-id`."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select :model/PulseChannel :pulse_id pulse-id))

(mu/defn pulse-channels-for-pulses
  "The PulseChannels of the Pulses with `pulse-ids`."
  [pulse-ids :- [:sequential ::lib.schema.id/pulse]]
  (t2/select :model/PulseChannel :pulse_id [:in pulse-ids]))

(mu/defn email-pulse-channel
  "The email PulseChannel of the Pulse with `pulse-id`, or nil."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select-one :model/PulseChannel :pulse_id pulse-id :channel_type "email"))

(mu/defn email-pulse-channel-id
  "The id of the email PulseChannel of the Pulse with `pulse-id`, or nil."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select-one-pk :model/PulseChannel :pulse_id pulse-id :channel_type "email"))

(mu/defn pulse-ids-with-channels
  "The set of ids among `pulse-ids` of the Pulses that still have a PulseChannel."
  [pulse-ids :- [:sequential ::lib.schema.id/pulse]]
  (t2/select-fn-set :pulse_id :model/PulseChannel :pulse_id [:in pulse-ids]))

(mu/defn pulse-channel-details
  "The details of the PulseChannel with `channel-id`, or nil."
  [channel-id :- ms/PositiveInt]
  (t2/select-one-fn :details :model/PulseChannel :id channel-id))

(mu/defn pulse-channels-without-recipients
  "The id, details, Channel, and type of the PulseChannels of the Pulse with `pulse-id` that have no recipients."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select [:model/PulseChannel :id :details :channel_id :channel_type]
             {:where [:and
                      [:= :pulse_id pulse-id]
                      [:not [:exists ^:allow-subquery
                             {:select [1]
                              :from   [:pulse_channel_recipient]
                              :where  [:= :pulse_channel_recipient.pulse_channel_id
                                       :pulse_channel.id]}]]]}))

(mu/defn enabled-pulse-channel-ids
  "The ids among `channel-ids` of enabled PulseChannels, or nil."
  [channel-ids :- [:set ms/PositiveInt]]
  (t2/select-pks-set :model/PulseChannel :id [:in channel-ids] :enabled true))

(mu/defn active-dashboard-subscription-channels
  "The enabled PulseChannels of dashboard subscriptions whose Dashboard is not archived."
  []
  (t2/select :model/PulseChannel
             {:select    [:pc.*]
              :from      [[:pulse_channel :pc]]
              :left-join [[:pulse :p] [:= :pc.pulse_id :p.id]
                          [:report_dashboard :d] [:= :p.dashboard_id :d.id]]
              :where     [:and
                          [:= :pc.enabled true]
                          ;; only do this for dashboard subscriptions, alert has been
                          ;; migrated to notifications
                          [:not= :p.dashboard_id nil]
                          [:= :d.archived false]]}))

(mu/defn insert-pulse-channel!
  "Insert the PulseChannel `row` and return its id."
  [row :- ::pulse.schema/pulse-channel.update]
  (t2/insert-returning-pk! :model/PulseChannel row))

(mu/defn update-pulse-channel!
  "Apply `changes` to the PulseChannel with `channel-id`."
  [channel-id :- ms/PositiveInt
   changes    :- ::pulse.schema/pulse-channel.update]
  (t2/update! :model/PulseChannel :id channel-id changes))

(mu/defn set-pulse-channels-enabled!
  "Set the enabled flag of the PulseChannels of the Pulses with `pulse-ids`."
  [pulse-ids :- [:sequential ::lib.schema.id/pulse]
   enabled?  :- :boolean]
  (t2/update! :model/PulseChannel :pulse_id [:in pulse-ids] {:enabled enabled?}))

(mu/defn pulse-channel
  "The PulseChannel with `channel-id`, or nil."
  [channel-id :- ms/PositiveInt]
  (t2/select-one :model/PulseChannel :id [:auto/param channel-id]))

(mu/defn pulse-channels-with-ids
  "The PulseChannels with `channel-ids`."
  [channel-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/PulseChannel :id [:in channel-ids]))

(mu/defn delete-pulse-channels!
  "Delete the PulseChannels with `channel-ids`."
  [channel-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/PulseChannel :id [:in channel-ids]))

(mu/defn active-recipients-for-channels
  "The id, email, name, and PulseChannel id of the active User recipients of the PulseChannels with `channel-ids`, in
  User id order."
  [channel-ids :- [:sequential ms/PositiveInt]]
  (t2/select [:model/User :id :email :first_name :last_name :pcr.pulse_channel_id]
             {:left-join [[:pulse_channel_recipient :pcr] [:= :core_user.id :pcr.user_id]]
              :where     [:and
                          [:in :pcr.pulse_channel_id channel-ids]
                          [:= :core_user.is_active true]]
              :order-by [[:core_user.id :asc]]}))

(mu/defn pulse-channel-recipient-id
  "The id of the PulseChannelRecipient of the User with `user-id` on the PulseChannel with `channel-id`, or nil."
  [channel-id :- ms/PositiveInt
   user-id    :- ::lib.schema.id/user]
  (t2/select-one-pk :model/PulseChannelRecipient :pulse_channel_id channel-id :user_id user-id))

(mu/defn pulse-channel-recipient-user-ids
  "The User ids of the PulseChannelRecipients of the PulseChannel with `channel-id`."
  [channel-id :- ms/PositiveInt]
  (t2/select-fn-set :user_id :model/PulseChannelRecipient, :pulse_channel_id channel-id))

(mu/defn pulse-channel-recipients-for-user
  "The PulseChannelRecipients of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select :model/PulseChannelRecipient :user_id user-id))

(mu/defn pulse-channel-recipients-by-ids
  "The PulseChannelRecipients with `recipient-ids`."
  [recipient-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/PulseChannelRecipient :id [:in recipient-ids]))

(mu/defn pulse-channel-recipient-counts
  "A map of PulseChannel id to its number of PulseChannelRecipients, for the PulseChannels with `channel-ids`."
  [channel-ids :- [:sequential ms/PositiveInt]]
  (into {}
        (map (juxt :pulse_channel_id :count))
        (t2/select [:model/PulseChannelRecipient :pulse_channel_id [:%count.* :count]]
                   :pulse_channel_id [:in channel-ids]
                   {:group-by [:pulse_channel_id]})))

(mu/defn insert-pulse-channel-recipients!
  "Insert the PulseChannelRecipient `rows`."
  [rows :- [:sequential ::pulse.schema/pulse-channel-recipient.update]]
  (t2/insert! :model/PulseChannelRecipient rows))

(mu/defn delete-pulse-channel-recipients!
  "Delete the PulseChannelRecipients with `recipient-ids`."
  [recipient-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/PulseChannelRecipient :id [:in recipient-ids]))

(mu/defn delete-pulse-channel-recipients-raw!
  "Delete the PulseChannelRecipients of the Users with `user-ids` on the PulseChannel with `channel-id`, without
  running model hooks."
  [channel-id :- ms/PositiveInt
   user-ids   :- [:set ::lib.schema.id/user]]
  (t2/with-transaction [_conn]
    (change-log/log-rows! :model/PulseChannelRecipient :delete :pulse_channel_id channel-id :user_id [:in user-ids])
    #_{:clj-kondo/ignore [:metabase/change-log-raw-write]} ; logged on the line above
    (t2/delete! (t2/table-name :model/PulseChannelRecipient) :pulse_channel_id channel-id :user_id [:in user-ids])))

(mu/defn user-tenant-ids
  "A map of User ID to `:tenant_id` for `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn :tenant_id :model/User :id [:in user-ids]))

(defn user-name-and-email
  "The first name, last name, and email of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one [:model/User :first_name :last_name :email] :id [:auto/param user-id]))

(defn users-names-and-emails
  "The first names, last names, and emails of the Users with `user-ids`."
  [user-ids]
  (t2/select [:model/User :first_name :last_name :email] :id [:in user-ids]))

(defn pulse-channel-kinds-for-pulse
  "The id, channel type, and details of the PulseChannels of the Pulse with `pulse-id`."
  [pulse-id]
  (t2/select [:model/PulseChannel :id :channel_type :details] :pulse_id [:= pulse-id]))

(defn pulses-with-ids
  "The Pulses whose ids are in `pulse-ids`, archived or not."
  [pulse-ids]
  (t2/select :model/Pulse :id [:in pulse-ids]))

(defn enabled-pulse-channels
  "The id, channel type, details, and channel id of the enabled PulseChannels of the Pulse with `pulse-id`."
  [pulse-id]
  (t2/select [:model/PulseChannel :id :channel_type :details :channel_id] :pulse_id [:= pulse-id] :enabled true))

(defn pulse-channel-recipient-rows
  "The `:user_id` rows of the PulseChannelRecipients of the PulseChannel with `channel-id`."
  [channel-id]
  (t2/select [:model/PulseChannelRecipient :user_id] :pulse_channel_id channel-id))

(defn dashboard-parameters
  "The id and parameters of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one [:model/Dashboard :id :parameters] :id [:auto/param dashboard-id]))

(defn dashboard-name-description-creator
  "The name, description, and creator id of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one [:model/Dashboard :name :description :creator_id] :id [:auto/param dashboard-id]))

(defn unarchived-pulses-for-dashboard
  "The unarchived Pulses of the Dashboard with `dashboard-id`, in id order."
  [dashboard-id]
  (t2/select :model/Pulse :dashboard_id dashboard-id :archived false {:order-by [[:id :asc]]}))

(mu/defn collection-pulse-items :- [:maybe :map]
  "The query of the Pulses, but the alerts and the dashboard subscriptions, in `collection` that the collection items
  listing of `opts` holds, nil when `opts` restrict the items to
  those created by a user, which Pulses do not record."
  [collection                                        :- :map
   {:keys [archived? pinned-state created-by-id]} :- :map]
  (when (nil? created-by-id)
    {:select-distinct [:p.id
                       :p.name
                       :p.entity_id
                       :p.collection_position
                       :p.collection_id
                       [(h2x/literal "pulse") :model]]
     :from            [[:pulse :p]]
     :left-join       [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
     :where           [:and
                       [:= :p.collection_id      (:id collection)]
                       [:= :p.archived           (boolean archived?)]
                       [:= :p.alert_condition    nil]
                       [:= :p.dashboard_id nil]
                       (collections.listing/pinned-state->clause pinned-state :p.collection_position)]}))

(mu/defn pulse-channel-ids-for-channels
  "The IDs of the PulseChannels of the Channels with `channel-ids`."
  [channel-ids :- [:sequential ms/PositiveInt]]
  (vec (t2/select-pks-vec :model/PulseChannel :channel_id [:in channel-ids])))

(mu/defn shift-pulse-positions! :- :int
  "Add or subtract (`plus-or-minus`) one from the `collection_position` of the Pulses in the Collection with
  `collection-id` whose position matches `position-clause`, returning the number updated."
  [collection-id   :- [:maybe ::lib.schema.id/collection]
   position-clause :- [:or
                       [:tuple [:enum :> :>=] ms/PositiveInt]
                       [:tuple [:= :between] ms/PositiveInt ms/PositiveInt]]
   plus-or-minus   :- [:enum :+ :-]]
  (t2/update! :model/Pulse {:collection_id       collection-id
                            :collection_position position-clause}
              {:collection_position [plus-or-minus :collection_position 1]}))
