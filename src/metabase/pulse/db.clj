(ns metabase.pulse.db
  "Application database queries for the pulse module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card card-id))

(defn card-query
  "The query of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one-fn :dataset_query [:model/Card :dataset_query] card-id))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard :id dashboard-id))

(defn dashboard-collection-id
  "The Collection id of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one-fn :collection_id :model/Dashboard, :id dashboard-id))

(defn dashcard-ids-by-card
  "A map of Card id to DashboardCard id for the DashboardCards of the Dashboard with `dashboard-id` showing one of
  `card-ids`."
  [dashboard-id card-ids]
  (t2/select-fn->pk :card_id :model/DashboardCard :dashboard_id dashboard-id :card_id [:in card-ids]))

(defn channel
  "The Channel with `channel-id`, or nil."
  [channel-id]
  (t2/select-one :model/Channel :id channel-id))

(defn active-http-channel-exists?
  "Whether an active HTTP Channel exists."
  []
  (t2/exists? :model/Channel :type :channel/http :active true))

(defn superusers
  "The superusers."
  []
  (t2/select :model/User :is_superuser true))

(defn user-emails-by-id
  "A map of User id to email for the Users with `user-ids`."
  [user-ids]
  (t2/select-pk->fn :email :model/User, :id [:in user-ids]))

(defn pulse
  "The Pulse with `pulse-id`, or nil."
  [pulse-id]
  (t2/select-one :model/Pulse :id pulse-id))

(defn pulse-id
  "The id of the Pulse with `pulse-id` if it exists, or nil."
  [pulse-id]
  (t2/select-one-pk :model/Pulse :id pulse-id))

(defn unarchived-pulse
  "The unarchived Pulse with `pulse-id`, or nil."
  [pulse-id]
  (t2/select-one :model/Pulse :id pulse-id :archived false))

(defn unarchived-non-alert-pulse
  "The unarchived, non-alert Pulse with `pulse-id`, or nil."
  [pulse-id]
  (t2/select-one :model/Pulse :id pulse-id :archived false :alert_condition nil))

(defn alert
  "The Pulse with `pulse-id` if it is an alert, or nil."
  [pulse-id]
  (t2/select-one :model/Pulse, :id pulse-id, :alert_condition [:not= nil]))

(defn alerts
  "The alert-type Pulses (unarchived unless `archived?`), optionally narrowed to those with a recipient or creator
  `user-id`, ordered by lower-cased name."
  [archived? user-id]
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

(defn pulses
  "The dashboard-subscription Pulses (unarchived unless `archived?`), optionally narrowed to `dashboard-id` and/or
  those with a recipient or creator `user-id`, ordered by lower-cased name."
  [archived? dashboard-id user-id]
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

(defn alerts-for-card-and-user
  "The alert-type Pulses (unarchived unless `archived?`) on the Card with `card-id` that the User with `user-id` is
  set to receive."
  [card-id user-id archived?]
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

(defn alerts-for-cards
  "The alert-type Pulses (unarchived unless `archived?`) on any of the Cards with `card-ids`."
  [card-ids archived?]
  (t2/select :model/Pulse
             {:select [:p.*]
              :from   [[:pulse :p]]
              :join   [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
              :where  [:and
                       [:not= :p.alert_condition nil]
                       [:in :pc.card_id card-ids]
                       [:= :p.archived archived?]]}))

(defn legacy-pulse-count
  "The number of unarchived Pulses that are neither dashboard subscriptions nor alerts."
  []
  (t2/count :model/Pulse :dashboard_id nil :alert_condition nil :archived false))

(defn legacy-pulses
  "The unarchived Pulses that are neither dashboard subscriptions nor alerts."
  []
  (t2/select :model/Pulse :dashboard_id nil :alert_condition nil :archived false))

(defn insert-pulse!
  "Insert the Pulse `pulse` and return the inserted instance."
  [pulse]
  (t2/insert-returning-instance! :model/Pulse pulse))

(defn update-pulse!
  "Apply `changes` to the Pulse with `pulse-id`."
  [pulse-id changes]
  (t2/update! :model/Pulse pulse-id changes))

(defn update-pulses-for-dashboard!
  "Apply `changes` to the Pulses of the Dashboard with `dashboard-id`."
  [dashboard-id changes]
  (t2/update! :model/Pulse {:dashboard_id dashboard-id} changes))

(defn pulse-cards-for-pulses
  "The Cards of the Pulses with `pulse-ids` together with their PulseCard options, in position order. Excludes
  archived Cards unless `include-archived?`."
  [pulse-ids include-archived?]
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
                (when-not include-archived? [:= :c.archived false])]
    :order-by [[:pc.position :asc]]}))

(defn pulse-card-refs
  "The Card id (as `:id`), export options, and DashboardCard id of the PulseCards of the Pulse with `pulse-id`, in
  position order."
  [pulse-id]
  (t2/select [:model/PulseCard [:card_id :id] :include_csv :include_xls :dashboard_card_id]
             :pulse_id pulse-id
             {:order-by [[:position :asc]]}))

(defn max-pulse-card-position
  "The `:max` position of the PulseCards of the Pulse with `pulse-id`."
  [pulse-id]
  (t2/select-one [:model/PulseCard [:%max.position :max]] :pulse_id pulse-id))

(defn insert-pulse-cards!
  "Insert the PulseCard `rows`."
  [rows]
  (t2/insert! :model/PulseCard rows))

(defn delete-pulse-cards-for-pulse!
  "Delete the PulseCards of the Pulse with `pulse-id`."
  [pulse-id]
  (t2/delete! :model/PulseCard :pulse_id pulse-id))

(defn pulse-channels-for-pulse
  "The PulseChannels of the Pulse with `pulse-id`."
  [pulse-id]
  (t2/select :model/PulseChannel :pulse_id pulse-id))

(defn pulse-channels-for-pulses
  "The PulseChannels of the Pulses with `pulse-ids`."
  [pulse-ids]
  (t2/select :model/PulseChannel :pulse_id [:in pulse-ids]))

(defn email-pulse-channel
  "The email PulseChannel of the Pulse with `pulse-id`, or nil."
  [pulse-id]
  (t2/select-one :model/PulseChannel :pulse_id pulse-id :channel_type "email"))

(defn email-pulse-channel-id
  "The id of the email PulseChannel of the Pulse with `pulse-id`, or nil."
  [pulse-id]
  (t2/select-one-pk :model/PulseChannel :pulse_id pulse-id :channel_type "email"))

(defn pulse-channel-details
  "The details of the PulseChannel with `channel-id`, or nil."
  [channel-id]
  (t2/select-one-fn :details :model/PulseChannel :id channel-id))

(defn pulse-channels-without-recipients
  "The id, details, Channel, and type of the PulseChannels of the Pulse with `pulse-id` that have no recipients."
  [pulse-id]
  (t2/select [:model/PulseChannel :id :details :channel_id :channel_type]
             {:where [:and
                      [:= :pulse_id pulse-id]
                      [:not [:exists ^:allow-subquery
                             {:select [1]
                              :from   [:pulse_channel_recipient]
                              :where  [:= :pulse_channel_recipient.pulse_channel_id
                                       :pulse_channel.id]}]]]}))

(defn enabled-pulse-channel-ids
  "The ids among `channel-ids` of enabled PulseChannels, or nil."
  [channel-ids]
  (t2/select-pks-set :model/PulseChannel :id [:in channel-ids] :enabled true))

(defn active-dashboard-subscription-channels
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

(defn other-pulse-channel-count
  "The number of PulseChannels of the Pulse with `pulse-id` other than `channel-id`."
  [pulse-id channel-id]
  (t2/count :model/PulseChannel :pulse_id pulse-id, :id [:not= channel-id]))

(defn insert-pulse-channel!
  "Insert the PulseChannel `row` and return its id."
  [row]
  (t2/insert-returning-pk! :model/PulseChannel row))

(defn update-pulse-channel!
  "Apply `changes` to the PulseChannel with `channel-id`."
  [channel-id changes]
  (t2/update! :model/PulseChannel channel-id changes))

(defn set-pulse-channels-enabled!
  "Set the enabled flag of the PulseChannels of the Pulse with `pulse-id`."
  [pulse-id enabled?]
  (t2/update! :model/PulseChannel :pulse_id pulse-id {:enabled enabled?}))

(defn delete-pulse-channel!
  "Delete the PulseChannel with `channel-id`."
  [channel-id]
  (t2/delete! :model/PulseChannel :id channel-id))

(defn delete-pulse-channels!
  "Delete the PulseChannels with `channel-ids`."
  [channel-ids]
  (t2/delete! :model/PulseChannel :id [:in channel-ids]))

(defn delete-pulse-channels-for-pulse!
  "Delete the PulseChannels of the Pulse with `pulse-id`."
  [pulse-id]
  (t2/delete! :model/PulseChannel :pulse_id pulse-id))

(defn active-recipients-for-channels
  "The id, email, name, and PulseChannel id of the active User recipients of the PulseChannels with `channel-ids`, in
  User id order."
  [channel-ids]
  (t2/select [:model/User :id :email :first_name :last_name :pcr.pulse_channel_id]
             {:left-join [[:pulse_channel_recipient :pcr] [:= :core_user.id :pcr.user_id]]
              :where     [:and
                          [:in :pcr.pulse_channel_id channel-ids]
                          [:= :core_user.is_active true]]
              :order-by [[:core_user.id :asc]]}))

(defn pulse-channel-recipient-id
  "The id of the PulseChannelRecipient of the User with `user-id` on the PulseChannel with `channel-id`, or nil."
  [channel-id user-id]
  (t2/select-one-pk :model/PulseChannelRecipient :pulse_channel_id channel-id :user_id user-id))

(defn pulse-channel-recipient-user-ids
  "The User ids of the PulseChannelRecipients of the PulseChannel with `channel-id`."
  [channel-id]
  (t2/select-fn-set :user_id :model/PulseChannelRecipient, :pulse_channel_id channel-id))

(defn other-pulse-channel-recipient-count
  "The number of PulseChannelRecipients of the PulseChannel with `channel-id` other than `recipient-id`."
  [channel-id recipient-id]
  (t2/count :model/PulseChannelRecipient :pulse_channel_id channel-id :id [:not= recipient-id]))

(defn insert-pulse-channel-recipients!
  "Insert the PulseChannelRecipient `rows`."
  [rows]
  (t2/insert! :model/PulseChannelRecipient rows))

(defn delete-pulse-channel-recipient!
  "Delete the PulseChannelRecipient with `recipient-id`."
  [recipient-id]
  (t2/delete! :model/PulseChannelRecipient :id recipient-id))

(defn delete-pulse-channel-recipients-raw!
  "Delete the PulseChannelRecipients of the Users with `user-ids` on the PulseChannel with `channel-id`, without
  running model hooks."
  [channel-id user-ids]
  (t2/delete! (t2/table-name :model/PulseChannelRecipient) :pulse_channel_id channel-id :user_id [:in user-ids]))

(defn delete-notifications!
  "Delete the Notifications with `notification-ids`."
  [notification-ids]
  (t2/delete! :model/Notification :id [:in notification-ids]))

(defn user-tenant-ids
  "A map of User ID to `:tenant_id` for `user-ids`."
  [user-ids]
  (t2/select-pk->fn :tenant_id :model/User :id [:in user-ids]))
