(ns metabase.pulse.db
  "Application database queries for the pulse module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private PulseRow
  "A whole (or partial) row for the `pulse` table."
  [:map {:closed true}
   [:id                   {:optional true} :any]
   [:creator_id           {:optional true} :any]
   [:name                 {:optional true} :any]
   [:created_at           {:optional true} :any]
   [:updated_at           {:optional true} :any]
   [:skip_if_empty        {:optional true} :any]
   [:alert_condition      {:optional true} :any]
   [:alert_first_only     {:optional true} :any]
   [:alert_above_goal     {:optional true} :any]
   [:collection_id        {:optional true} :any]
   [:collection_position  {:optional true} :any]
   [:archived             {:optional true} :any]
   [:dashboard_id         {:optional true} :any]
   [:parameters           {:optional true} :any]
   [:entity_id            {:optional true} :any]
   [:disable_links        {:optional true} :any]])

(def ^:private PulseChanges
  "The keys callers pass to [[update-pulse!]] and [[update-pulses-for-dashboard!]]."
  [:map {:closed true}
   [:archived            {:optional true} :any]
   [:collection_id       {:optional true} :any]
   [:collection_position {:optional true} :any]
   [:name                {:optional true} :any]
   [:alert_condition     {:optional true} :any]
   [:alert_above_goal    {:optional true} :any]
   [:alert_first_only    {:optional true} :any]
   [:skip_if_empty       {:optional true} :any]
   [:parameters          {:optional true} :any]
   [:updated_at          {:optional true} :any]])

(def ^:private PulseCardRow
  "A whole (or partial) row for the `pulse_card` table."
  [:map {:closed true}
   [:id                 {:optional true} :any]
   [:pulse_id           {:optional true} :any]
   [:card_id            {:optional true} :any]
   [:position            {:optional true} :any]
   [:include_csv        {:optional true} :any]
   [:include_xls        {:optional true} :any]
   [:dashboard_card_id  {:optional true} :any]
   [:entity_id          {:optional true} :any]
   [:format_rows        {:optional true} :any]
   [:pivot_results      {:optional true} :any]])

(def ^:private PulseChannelRow
  "A whole (or partial) row for the `pulse_channel` table. [[update-pulse-channel!]] callers sometimes pass an
  entire existing PulseChannel instance back in, so every column is accepted."
  [:map {:closed true}
   [:id             {:optional true} :any]
   [:pulse_id       {:optional true} :any]
   [:channel_type   {:optional true} :any]
   [:details        {:optional true} :any]
   [:schedule_type  {:optional true} :any]
   [:schedule_hour  {:optional true} :any]
   [:schedule_day   {:optional true} :any]
   [:created_at     {:optional true} :any]
   [:updated_at     {:optional true} :any]
   [:schedule_frame {:optional true} :any]
   [:enabled        {:optional true} :any]
   [:entity_id      {:optional true} :any]
   [:channel_id     {:optional true} :any]])

(def ^:private PulseChannelRecipientRow
  "A whole (or partial) row for the `pulse_channel_recipient` table."
  [:map {:closed true}
   [:id                {:optional true} :any]
   [:pulse_channel_id  {:optional true} :any]
   [:user_id           {:optional true} :any]])

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card card-id))

(mu/defn card-query :- :any
  "The query of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one-fn :dataset_query [:model/Card :dataset_query] card-id))

(mu/defn dashboard :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The Dashboard with `dashboard-id`, or nil. `dashboard-id` may be nil (e.g. a legacy Pulse with no Dashboard), in
  which case the result is nil."
  [dashboard-id :- [:maybe ms/PositiveInt]]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboard-collection-id :- [:maybe ms/PositiveInt]
  "The Collection id of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one-fn :collection_id :model/Dashboard, :id dashboard-id))

(mu/defn dashcard-ids-by-card :- [:map-of ms/PositiveInt ms/PositiveInt]
  "A map of Card id to DashboardCard id for the DashboardCards of the Dashboard with `dashboard-id` showing one of
  `card-ids`."
  [dashboard-id :- ms/PositiveInt
   card-ids     :- [:seqable ms/PositiveInt]]
  (t2/select-fn->pk :card_id :model/DashboardCard :dashboard_id dashboard-id :card_id [:in card-ids]))

(mu/defn pulse-card-pairs-for-dashboard :- [:sequential [:map {:closed true}
                                                         [:pulse-id ms/PositiveInt]
                                                         [:card-id  [:maybe ms/PositiveInt]]]]
  "Distinct `:pulse-id`/`:card-id` pairs for the Pulses (subscriptions) attached to the Dashboard with
  `dashboard-id`."
  [dashboard-id :- ms/PositiveInt]
  (app-db/query {:select-distinct [[:p.id :pulse-id] [:pc.card_id :card-id]]
                 :from            [[:pulse :p]]
                 :left-join       [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
                 :where           [:= :p.dashboard_id dashboard-id]}))

(mu/defn dashboard-card-ids-for-dashboard :- [:sequential ms/PositiveInt]
  "The distinct, non-nil Card ids shown by the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt]
  (map :card_id (app-db/query {:select-distinct [:dc.card_id]
                               :from            [[:report_dashboardcard :dc]]
                               :where           [:and
                                                 [:= :dc.dashboard_id dashboard-id]
                                                 [:not= :dc.card_id nil]]})))

(mu/defn channel :- [:maybe (ms/InstanceOf :model/Channel)]
  "The Channel with `channel-id`, or nil."
  [channel-id :- ms/PositiveInt]
  (t2/select-one :model/Channel :id channel-id))

(mu/defn active-http-channel-exists? :- :boolean
  "Whether an active HTTP Channel exists."
  []
  (t2/exists? :model/Channel :type :channel/http :active true))

(mu/defn superusers :- [:sequential (ms/InstanceOf :model/User)]
  "The superusers."
  []
  (t2/select :model/User :is_superuser true))

(mu/defn user-emails-by-id :- [:map-of ms/PositiveInt :string]
  "A map of User id to email for the Users with `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn :email :model/User, :id [:in user-ids]))

(mu/defn pulse :- [:maybe (ms/InstanceOf :model/Pulse)]
  "The Pulse with `pulse-id`, or nil."
  [pulse-id :- ms/PositiveInt]
  (t2/select-one :model/Pulse :id pulse-id))

(mu/defn pulse-id :- [:maybe ms/PositiveInt]
  "The id of the Pulse with `pulse-id` if it exists, or nil."
  [pulse-id :- ms/PositiveInt]
  (t2/select-one-pk :model/Pulse :id pulse-id))

(mu/defn unarchived-pulse :- [:maybe (ms/InstanceOf :model/Pulse)]
  "The unarchived Pulse with `pulse-id`, or nil."
  [pulse-id :- ms/PositiveInt]
  (t2/select-one :model/Pulse :id pulse-id :archived false))

(mu/defn unarchived-non-alert-pulse :- [:maybe (ms/InstanceOf :model/Pulse)]
  "The unarchived, non-alert Pulse with `pulse-id`, or nil."
  [pulse-id :- ms/PositiveInt]
  (t2/select-one :model/Pulse :id pulse-id :archived false :alert_condition nil))

(mu/defn alert :- [:maybe (ms/InstanceOf :model/Pulse)]
  "The Pulse with `pulse-id` if it is an alert, or nil."
  [pulse-id :- ms/PositiveInt]
  (t2/select-one :model/Pulse, :id pulse-id, :alert_condition [:not= nil]))

(mu/defn alerts :- [:sequential (ms/InstanceOf :model/Pulse)]
  "The alert-type Pulses (unarchived unless `archived?`), optionally narrowed to those with a recipient or creator
  `user-id`, ordered by lower-cased name."
  [archived? :- :boolean
   user-id   :- [:maybe ms/PositiveInt]]
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

(mu/defn pulses :- [:sequential (ms/InstanceOf :model/Pulse)]
  "The dashboard-subscription Pulses (unarchived unless `archived?`), optionally narrowed to `dashboard-id` and/or
  those with a recipient or creator `user-id`, ordered by lower-cased name."
  [archived?    :- :boolean
   dashboard-id :- [:maybe ms/PositiveInt]
   user-id      :- [:maybe ms/PositiveInt]]
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

(mu/defn alerts-for-card-and-user :- [:sequential (ms/InstanceOf :model/Pulse)]
  "The alert-type Pulses (unarchived unless `archived?`) on the Card with `card-id` that the User with `user-id` is
  set to receive."
  [card-id   :- ms/PositiveInt
   user-id   :- ms/PositiveInt
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

(mu/defn alerts-for-cards :- [:sequential (ms/InstanceOf :model/Pulse)]
  "The alert-type Pulses (unarchived unless `archived?`) on any of the Cards with `card-ids`."
  [card-ids  :- [:seqable ms/PositiveInt]
   archived? :- :boolean]
  (t2/select :model/Pulse
             {:select [:p.*]
              :from   [[:pulse :p]]
              :join   [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
              :where  [:and
                       [:not= :p.alert_condition nil]
                       [:in :pc.card_id card-ids]
                       [:= :p.archived archived?]]}))

(mu/defn legacy-pulse-count :- ms/IntGreaterThanOrEqualToZero
  "The number of unarchived Pulses that are neither dashboard subscriptions nor alerts."
  []
  (t2/count :model/Pulse :dashboard_id nil :alert_condition nil :archived false))

(mu/defn legacy-pulses :- [:sequential (ms/InstanceOf :model/Pulse)]
  "The unarchived Pulses that are neither dashboard subscriptions nor alerts."
  []
  (t2/select :model/Pulse :dashboard_id nil :alert_condition nil :archived false))

(mu/defn insert-pulse! :- (ms/InstanceOf :model/Pulse)
  "Insert the Pulse `pulse` and return the inserted instance."
  [pulse :- PulseRow]
  (t2/insert-returning-instance! :model/Pulse pulse))

(mu/defn update-pulse! :- :int
  "Apply `changes` to the Pulse with `pulse-id`."
  [pulse-id :- ms/PositiveInt
   changes  :- PulseChanges]
  (t2/update! :model/Pulse pulse-id changes))

(mu/defn update-pulses-for-dashboard! :- :int
  "Apply `changes` to the Pulses of the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt
   changes      :- PulseChanges]
  (t2/update! :model/Pulse {:dashboard_id dashboard-id} changes))

(mu/defn pulse-cards-for-pulses :- [:sequential (ms/InstanceOf :model/Card)]
  "The Cards of the Pulses with `pulse-ids` together with their PulseCard options, in position order. Excludes
  archived Cards unless `include-archived?`."
  [pulse-ids         :- [:seqable ms/PositiveInt]
   include-archived? :- :boolean]
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

(mu/defn pulse-card-refs :- [:sequential (ms/InstanceOf :model/PulseCard)]
  "The Card id (as `:id`), export options, and DashboardCard id of the PulseCards of the Pulse with `pulse-id`, in
  position order."
  [pulse-id :- ms/PositiveInt]
  (t2/select [:model/PulseCard [:card_id :id] :include_csv :include_xls :dashboard_card_id]
             :pulse_id pulse-id
             {:order-by [[:position :asc]]}))

(mu/defn max-pulse-card-position :- [:maybe (ms/InstanceOf :model/PulseCard)]
  "The `:max` position of the PulseCards of the Pulse with `pulse-id`."
  [pulse-id :- ms/PositiveInt]
  (t2/select-one [:model/PulseCard [:%max.position :max]] :pulse_id pulse-id))

(mu/defn insert-pulse-cards! :- :int
  "Insert the PulseCard `rows`."
  [rows :- [:sequential PulseCardRow]]
  (t2/insert! :model/PulseCard rows))

(mu/defn delete-pulse-cards-for-pulse! :- :int
  "Delete the PulseCards of the Pulse with `pulse-id`."
  [pulse-id :- ms/PositiveInt]
  (t2/delete! :model/PulseCard :pulse_id pulse-id))

(mu/defn pulse-channels-for-pulse :- [:sequential (ms/InstanceOf :model/PulseChannel)]
  "The PulseChannels of the Pulse with `pulse-id`."
  [pulse-id :- ms/PositiveInt]
  (t2/select :model/PulseChannel :pulse_id pulse-id))

(mu/defn pulse-channels-for-pulses :- [:sequential (ms/InstanceOf :model/PulseChannel)]
  "The PulseChannels of the Pulses with `pulse-ids`."
  [pulse-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/PulseChannel :pulse_id [:in pulse-ids]))

(mu/defn email-pulse-channel :- [:maybe (ms/InstanceOf :model/PulseChannel)]
  "The email PulseChannel of the Pulse with `pulse-id`, or nil."
  [pulse-id :- ms/PositiveInt]
  (t2/select-one :model/PulseChannel :pulse_id pulse-id :channel_type "email"))

(mu/defn email-pulse-channel-id :- [:maybe ms/PositiveInt]
  "The id of the email PulseChannel of the Pulse with `pulse-id`, or nil."
  [pulse-id :- ms/PositiveInt]
  (t2/select-one-pk :model/PulseChannel :pulse_id pulse-id :channel_type "email"))

(mu/defn pulse-channel-details :- :any
  "The details of the PulseChannel with `channel-id`, or nil."
  [channel-id :- ms/PositiveInt]
  (t2/select-one-fn :details :model/PulseChannel :id channel-id))

(mu/defn pulse-channels-without-recipients :- [:sequential (ms/InstanceOf :model/PulseChannel)]
  "The id, details, Channel, and type of the PulseChannels of the Pulse with `pulse-id` that have no recipients."
  [pulse-id :- ms/PositiveInt]
  (t2/select [:model/PulseChannel :id :details :channel_id :channel_type]
             {:where [:and
                      [:= :pulse_id pulse-id]
                      [:not [:exists ^:allow-subquery
                             {:select [1]
                              :from   [:pulse_channel_recipient]
                              :where  [:= :pulse_channel_recipient.pulse_channel_id
                                       :pulse_channel.id]}]]]}))

(mu/defn enabled-pulse-channel-ids :- [:maybe [:set ms/PositiveInt]]
  "The ids among `channel-ids` of enabled PulseChannels, or nil."
  [channel-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pks-set :model/PulseChannel :id [:in channel-ids] :enabled true))

(mu/defn active-dashboard-subscription-channels :- [:sequential (ms/InstanceOf :model/PulseChannel)]
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

(mu/defn other-pulse-channel-count :- ms/IntGreaterThanOrEqualToZero
  "The number of PulseChannels of the Pulse with `pulse-id` other than `channel-id`."
  [pulse-id   :- ms/PositiveInt
   channel-id :- ms/PositiveInt]
  (t2/count :model/PulseChannel :pulse_id pulse-id, :id [:not= channel-id]))

(mu/defn insert-pulse-channel! :- ms/PositiveInt
  "Insert the PulseChannel `row` and return its id."
  [row :- PulseChannelRow]
  (t2/insert-returning-pk! :model/PulseChannel row))

(mu/defn update-pulse-channel! :- :int
  "Apply `changes` to the PulseChannel with `channel-id`."
  [channel-id :- ms/PositiveInt
   changes    :- PulseChannelRow]
  (t2/update! :model/PulseChannel channel-id changes))

(mu/defn set-pulse-channels-enabled! :- :int
  "Set the enabled flag of the PulseChannels of the Pulse with `pulse-id`."
  [pulse-id :- ms/PositiveInt
   enabled? :- :boolean]
  (t2/update! :model/PulseChannel :pulse_id pulse-id {:enabled enabled?}))

(mu/defn delete-pulse-channel! :- :int
  "Delete the PulseChannel with `channel-id`."
  [channel-id :- ms/PositiveInt]
  (t2/delete! :model/PulseChannel :id channel-id))

(mu/defn delete-pulse-channels! :- :int
  "Delete the PulseChannels with `channel-ids`."
  [channel-ids :- [:seqable ms/PositiveInt]]
  (t2/delete! :model/PulseChannel :id [:in channel-ids]))

(mu/defn delete-pulse-channels-for-pulse! :- :int
  "Delete the PulseChannels of the Pulse with `pulse-id`."
  [pulse-id :- ms/PositiveInt]
  (t2/delete! :model/PulseChannel :pulse_id pulse-id))

(mu/defn active-recipients-for-channels :- [:sequential (ms/InstanceOf :model/User)]
  "The id, email, name, and PulseChannel id of the active User recipients of the PulseChannels with `channel-ids`, in
  User id order."
  [channel-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/User :id :email :first_name :last_name :pcr.pulse_channel_id]
             {:left-join [[:pulse_channel_recipient :pcr] [:= :core_user.id :pcr.user_id]]
              :where     [:and
                          [:in :pcr.pulse_channel_id channel-ids]
                          [:= :core_user.is_active true]]
              :order-by [[:core_user.id :asc]]}))

(mu/defn pulse-channel-recipient-id :- [:maybe ms/PositiveInt]
  "The id of the PulseChannelRecipient of the User with `user-id` on the PulseChannel with `channel-id`, or nil."
  [channel-id :- ms/PositiveInt
   user-id    :- ms/PositiveInt]
  (t2/select-one-pk :model/PulseChannelRecipient :pulse_channel_id channel-id :user_id user-id))

(mu/defn pulse-channel-recipient-user-ids :- [:maybe [:set ms/PositiveInt]]
  "The User ids of the PulseChannelRecipients of the PulseChannel with `channel-id`."
  [channel-id :- ms/PositiveInt]
  (t2/select-fn-set :user_id :model/PulseChannelRecipient, :pulse_channel_id channel-id))

(mu/defn other-pulse-channel-recipient-count :- ms/IntGreaterThanOrEqualToZero
  "The number of PulseChannelRecipients of the PulseChannel with `channel-id` other than `recipient-id`."
  [channel-id   :- ms/PositiveInt
   recipient-id :- ms/PositiveInt]
  (t2/count :model/PulseChannelRecipient :pulse_channel_id channel-id :id [:not= recipient-id]))

(mu/defn insert-pulse-channel-recipients! :- :int
  "Insert the PulseChannelRecipient `rows`."
  [rows :- [:sequential PulseChannelRecipientRow]]
  (t2/insert! :model/PulseChannelRecipient rows))

(mu/defn delete-pulse-channel-recipient! :- :int
  "Delete the PulseChannelRecipient with `recipient-id`."
  [recipient-id :- ms/PositiveInt]
  (t2/delete! :model/PulseChannelRecipient :id recipient-id))

(mu/defn delete-pulse-channel-recipients-raw! :- :int
  "Delete the PulseChannelRecipients of the Users with `user-ids` on the PulseChannel with `channel-id`, without
  running model hooks."
  [channel-id :- ms/PositiveInt
   user-ids   :- [:seqable ms/PositiveInt]]
  (t2/delete! (t2/table-name :model/PulseChannelRecipient) :pulse_channel_id channel-id :user_id [:in user-ids]))

(mu/defn delete-notifications! :- :int
  "Delete the Notifications with `notification-ids`."
  [notification-ids :- [:seqable ms/PositiveInt]]
  (t2/delete! :model/Notification :id [:in notification-ids]))

(mu/defn user-tenant-ids :- [:map-of ms/PositiveInt [:maybe ms/PositiveInt]]
  "A map of User ID to `:tenant_id` for `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn :tenant_id :model/User :id [:in user-ids]))
