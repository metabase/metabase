(ns metabase.notification.db
  "Application database queries for the notification module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.change-log.core :as change-log]
   [metabase.channel.schema :as channel.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.notification.schema :as notification.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private NotificationRow
  "A whole Notification row for insert."
  [:map {:closed true}
   [:payload_type {:optional true} [:maybe [:or :keyword :string]]]
   [:active       {:optional true} [:maybe :boolean]]
   [:internal_id  {:optional true} [:maybe :string]]
   [:payload_id   {:optional true} [:maybe ms/PositiveInt]]
   [:creator_id   {:optional true} [:maybe ::lib.schema.id/user]]])

(def ^:private NotificationCardRow
  "A whole NotificationCard row for insert."
  [:map {:closed true}
   [:card_id         {:optional true} [:maybe ::lib.schema.id/card]]
   [:send_once       {:optional true} [:maybe :boolean]]
   [:send_condition  {:optional true} [:maybe [:or :keyword :string]]]
   [:disable_links   {:optional true} [:maybe :boolean]]])

(def ^:private NotificationHandlerRow
  "A whole NotificationHandler row for insert."
  [:map {:closed true}
   [:channel_type    {:optional true} [:maybe [:or :keyword :string]]]
   [:notification_id {:optional true} [:maybe ms/PositiveInt]]
   [:channel_id      {:optional true} [:maybe ms/PositiveInt]]
   [:template_id     {:optional true} [:maybe ms/PositiveInt]]
   [:active          {:optional true} [:maybe :boolean]]])

(def ^:private NotificationRecipientRow
  "A whole NotificationRecipient row for insert."
  [:map {:closed true}
   [:notification_handler_id {:optional true} [:maybe ms/PositiveInt]]
   [:type                    {:optional true} [:maybe [:or :keyword :string]]]
   [:user_id                 {:optional true} [:maybe ::lib.schema.id/user]]
   [:permissions_group_id    {:optional true} [:maybe ms/PositiveInt]]
   [:details                 {:optional true} [:maybe ::notification.schema/notification-recipient.details]]])

(def ^:private NotificationSubscriptionRow
  "A whole NotificationSubscription row for insert."
  [:map {:closed true}
   [:notification_id {:optional true} [:maybe ms/PositiveInt]]
   [:type            {:optional true} [:maybe [:or :keyword :string]]]
   [:event_name      {:optional true} [:maybe [:or :keyword :string]]]
   [:cron_schedule   {:optional true} [:maybe :string]]
   [:ui_display_type {:optional true} [:maybe [:or :keyword :string]]]])

(def ^:private PartModel
  "The models of the parts of a Notification that an update of it writes."
  [:enum :model/NotificationCard :model/NotificationSubscription :model/NotificationHandler
   :model/NotificationRecipient :model/ChannelTemplate])

(def ^:private PartRow
  "A row of a model of [[PartModel]], with the columns an update of a Notification writes."
  [:or NotificationCardRow NotificationSubscriptionRow NotificationHandlerRow NotificationRecipientRow
   ::channel.schema/channel-template.update])

(def ^:private AdminFilters
  "The filters accepted by [[admin-notifications-page]] and [[admin-notifications-count]]."
  [:map {:closed true}
   [:active                      {:optional true} [:maybe :boolean]]
   [:creator_id                  {:optional true} [:maybe ::lib.schema.id/user]]
   [:creator_active              {:optional true} [:maybe :boolean]]
   [:creatorless                 {:optional true} [:maybe :boolean]]
   [:card_id                     {:optional true} [:maybe ::lib.schema.id/card]]
   [:recipient_notification_ids  {:optional true} [:maybe [:or [:set ms/PositiveInt] [:sequential ms/PositiveInt]]]]
   [:channel                     {:optional true} [:maybe [:or :string [:sequential :string]]]]
   [:last_send_status            {:optional true} [:maybe [:enum :failing :successful]]]
   [:last_check_status           {:optional true} [:maybe [:enum :failing :successful]]]
   [:query                       {:optional true} [:maybe :string]]
   [:sort_column                 {:optional true} [:maybe [:enum :id :last_send :last_check :card_name :creator_name :updated_at]]]
   [:sort_direction              {:optional true} [:maybe [:enum :asc :desc]]]])

;;; --------------------------------------------- Notification ---------------------------------------------

(mu/defn notification
  "The Notification with `notification-id`, or nil."
  [notification-id :- ms/PositiveInt]
  (t2/select-one :model/Notification :id [:auto/param notification-id]))

(mu/defn notification-by-internal-id
  "The seeded Notification with `internal-id`, or nil."
  [internal-id :- :string]
  (t2/select-one :model/Notification :internal_id internal-id))

(mu/defn notification-for-handler
  "The Notification owning the NotificationHandler with `handler-id`, or nil."
  [handler-id :- ms/PositiveInt]
  (t2/select-one :model/Notification
                 :id [:in ^:allow-subquery {:select [:notification_id]
                                            :from   (t2/table-name :model/NotificationHandler)
                                            :where  [:= :id handler-id]}]))

(mu/defn notifications-matching
  "Reducible Notifications, optionally narrowed to `creator-id`, `creator-or-recipient-id` (a User who is either the
  creator or a recipient), `recipient-id`, `card-id`, and `payload-type`; active Notifications only unless
  `include-inactive?` or `legacy-active` (a boolean, overriding both) is given. `legacy-user-id` narrows to a User
  who is either the creator or a recipient."
  [{:keys [creator-id creator-or-recipient-id recipient-id card-id payload-type include-inactive? legacy-active
           legacy-user-id]}
   :- [:map {:closed true}
       [:creator-id               {:optional true} [:maybe ::lib.schema.id/user]]
       [:creator-or-recipient-id  {:optional true} [:maybe ms/PositiveInt]]
       [:recipient-id             {:optional true} [:maybe ms/PositiveInt]]
       [:card-id                  {:optional true} [:maybe ::lib.schema.id/card]]
       [:payload-type             {:optional true} [:maybe [:or :keyword :string]]]
       [:include-inactive?        {:optional true} [:maybe :boolean]]
       [:legacy-active            {:optional true} [:maybe :boolean]]
       [:legacy-user-id           {:optional true} [:maybe ::lib.schema.id/user]]]]
  (t2/reducible-select
   :model/Notification
   (cond-> {:select-distinct [:notification.*]
            :from            [[(t2/table-name :model/Notification) :notification]]}
     creator-id
     (sql.helpers/where [:= :notification.creator_id creator-id])

     recipient-id
     (-> (sql.helpers/left-join
          [(t2/table-name :model/NotificationHandler) :nh] [:= :nh.notification_id :notification.id])
         (sql.helpers/left-join
          [(t2/table-name :model/NotificationRecipient) :nr] [:= :nr.notification_handler_id :nh.id])
         (sql.helpers/where [:= :nr.user_id recipient-id]))

     creator-or-recipient-id
     (-> (sql.helpers/left-join
          [(t2/table-name :model/NotificationHandler) :nh] [:= :nh.notification_id :notification.id])
         (sql.helpers/left-join
          [(t2/table-name :model/NotificationRecipient) :nr] [:= :nr.notification_handler_id :nh.id])
         (sql.helpers/where [:or [:= :nr.user_id creator-or-recipient-id]
                             [:= :notification.creator_id creator-or-recipient-id]]))

     card-id
     (-> (sql.helpers/left-join
          [(t2/table-name :model/NotificationCard) :nc]
          [:and
           [:= :nc.id :notification.payload_id]
           [:= :notification.payload_type "notification/card"]])
         (sql.helpers/where [:= :nc.card_id card-id]))

     (and (nil? legacy-active) (not (true? include-inactive?)))
     (sql.helpers/where [:= :notification.active true])

     payload-type
     (sql.helpers/where [:= :notification.payload_type (u/qualified-name payload-type)])

     (some? legacy-active)
     (sql.helpers/where [:= :notification.active legacy-active])

     legacy-user-id
     (-> (sql.helpers/left-join
          [(t2/table-name :model/NotificationHandler) :nh] [:= :nh.notification_id :notification.id])
         (sql.helpers/left-join
          [(t2/table-name :model/NotificationRecipient) :nr] [:= :nr.notification_handler_id :nh.id])
         (sql.helpers/where [:or
                             [:= :nr.user_id legacy-user-id]
                             [:= :notification.creator_id legacy-user-id]])))))

(mu/defn notifications-by-id
  "The Notifications with `notification-ids`."
  [notification-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/Notification :id [:in %]) notification-ids))

(mu/defn card-notifications
  "The card Notifications among `notification-ids`."
  [notification-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/Notification :id [:in %] :payload_type :notification/card) notification-ids))

(mu/defn active-card-notifications-for-cards
  "The active card Notifications attached to the Cards with `card-ids`."
  [card-ids :- [:sequential {:min 1} ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select :model/Notification
                                  :active true
                                  :payload_type :notification/card
                                  {:where [:exists ^:allow-subquery {:select [1]
                                                                     :from   [[(t2/table-name :model/NotificationCard) :nc]]
                                                                     :where  [:and
                                                                              [:= :nc.id (u/qualified-key (t2/table-name :model/Notification) :payload_id)]
                                                                              [:in :nc.card_id [:auto/param %]]]}]})
                      card-ids))

(mu/defn active-system-event-notifications
  "The active Notifications subscribed to the system event named `event-name`."
  [event-name :- :string]
  (t2/select :model/Notification
             {:select    [:n.*]
              :from      [[(t2/table-name :model/Notification) :n]]
              :left-join [[(t2/table-name :model/NotificationSubscription) :ns] [:= :n.id :ns.notification_id]]
              :where     [:and
                          [:= :n.active true]
                          [:= :ns.event_name event-name]
                          [:= :ns.type "notification-subscription/system-event"]]}))

(mu/defn insert-notifications!
  "Insert the Notification `rows` with one statement per distinct set of columns and return the inserted instances in
  their order."
  [rows :- [:sequential {:min 1} NotificationRow]]
  (mdb/insert-returning-instances! :model/Notification rows))

(mu/defn update-notification-columns!
  "Apply `changes` to the Notification with `notification-id`, returning the number updated."
  [notification-id :- ms/PositiveInt
   changes         :- NotificationRow]
  (t2/update! :model/Notification :toucan/pk notification-id changes))

(mu/defn insert-part-rows!
  "Insert the `rows` of `model`, a model of a part of a Notification, with one statement per distinct set of columns,
  writing no change log, and return the inserted instances in their order."
  [model :- PartModel
   rows  :- [:sequential {:min 1} PartRow]]
  (mdb/insert-returning-instances! model rows))

(mu/defn update-part-rows!
  "Apply to the rows of `model`, a model of a part of a Notification, their changes in `updates`, each the `:id` of a
  row and the columns to change."
  [model   :- PartModel
   updates :- [:sequential [:merge PartRow [:map [:id ms/PositiveInt]]]]]
  (mdb/update-grouped! model updates))

(mu/defn delete-part-rows!
  "Delete the rows of `model`, a model of a part of a Notification, with `ids`, writing no change log."
  [model :- PartModel
   ids   :- [:sequential {:min 1} ms/PositiveInt]]
  (doseq [chunk (partition-all mdb/delete-partition-size ids)]
    (t2/delete! model :id [:in [:auto/param (vec chunk)]]))
  nil)

;;; ------------------------------------------- NotificationCard -------------------------------------------

(mu/defn notification-cards
  "The NotificationCards with `notification-card-ids`."
  [notification-card-ids :- [:set ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select :model/NotificationCard :id [:in %]) notification-card-ids))

(mu/defn notification-card-exists?
  "Whether a NotificationCard with `notification-card-id` exists."
  [notification-card-id :- ::lib.schema.id/card]
  (t2/exists? :model/NotificationCard :id notification-card-id))

(mu/defn notification-card-card-id
  "The `:card_id` of the NotificationCard with `notification-card-id`."
  [notification-card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :card_id :model/NotificationCard :id notification-card-id))

(mu/defn insert-notification-cards!
  "Insert the NotificationCard `rows` with one statement per distinct set of columns and return the inserted instances
  in their order."
  [rows :- [:sequential {:min 1} NotificationCardRow]]
  (u/prog1 (mdb/insert-returning-instances! :model/NotificationCard rows)
    (change-log/log-changes! :model/NotificationCard :insert <>)))

(mu/defn delete-notification-cards-for-notifications!
  "Delete the NotificationCards that are the payloads of the card Notifications with `notification-ids`, in one
  statement per partition of ids, returning the number deleted."
  [notification-ids :- [:sequential ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size (fn [chunk]
                                               (let [payload-ids [:in ^:allow-subquery {:select [:payload_id]
                                                                                        :from   [(t2/table-name :model/Notification)]
                                                                                        :where  [:and
                                                                                                 [:in :id [:auto/param (vec chunk)]]
                                                                                                 [:= :payload_type "notification/card"]]}]]
                                                 (change-log/log-rows! :model/NotificationCard :delete :id payload-ids)
                                                 (t2/delete! :model/NotificationCard :id payload-ids))) notification-ids))

;;; --------------------------------------- NotificationSubscription ---------------------------------------

(mu/defn subscription
  "The NotificationSubscription with `subscription-id`, or nil."
  [subscription-id :- ms/PositiveInt]
  (t2/select-one :model/NotificationSubscription :id [:auto/param subscription-id]))

(mu/defn subscriptions-for-notifications
  "The NotificationSubscriptions of the Notifications with `notification-ids` (nil entries are ignored)."
  [notification-ids :- [:sequential [:maybe ms/PositiveInt]]]
  (mdb/select-batched #(t2/select :model/NotificationSubscription :notification_id [:in %]) notification-ids))

(mu/defn active-cron-subscriptions-by-id
  "A map of ID to cron NotificationSubscription for every active Notification."
  []
  (t2/select-pk->fn identity :model/NotificationSubscription
                    :type :notification-subscription/cron
                    {:select [:ns.*]
                     :from   [[(t2/table-name :model/NotificationSubscription) :ns]]
                     :join   [[(t2/table-name :model/Notification) :n] [:= :ns.notification_id :n.id]]
                     :where  [:and
                              [:= :ns.type "notification-subscription/cron"]
                              [:= :n.active true]]}))

(mu/defn insert-subscriptions!
  "Insert the NotificationSubscription `subscriptions`, returning the inserted instances."
  [subscriptions :- [:sequential NotificationSubscriptionRow]]
  (u/prog1 (mdb/insert-returning-instances! :model/NotificationSubscription subscriptions)
    (change-log/log-changes! :model/NotificationSubscription :insert <>)))

;;; ------------------------------------ NotificationHandler / Recipient ------------------------------------

(mu/defn handlers-for-notifications
  "The NotificationHandlers of the Notifications with `notification-ids`."
  [notification-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/NotificationHandler :notification_id [:in %]) notification-ids))

(mu/defn handler-notification-ids-for-email
  "The set of Notification IDs of the handlers whose recipients (joined to their user) have an exact, lower-cased
  `email` match, either directly (via the recipient's User) or among `raw-value-handler-ids` (handler IDs already
  known to have a matching raw-value recipient)."
  [lower-email           :- :string
   raw-value-handler-ids :- [:set ms/PositiveInt]]
  (let [user-clause [:and
                     [:= :nr.type "notification-recipient/user"]
                     [:= [:lower :cu.email] lower-email]]]
    (letfn [(notification-ids-where [where]
              (t2/select-fn-set :notification_id (t2/table-name :model/NotificationHandler)
                                {:join      [[(t2/table-name :model/NotificationRecipient) :nr]
                                             [:= :nr.notification_handler_id (u/qualified-key (t2/table-name :model/NotificationHandler) :id)]]
                                 :left-join [[(t2/table-name :model/User) :cu] [:= :cu.id :nr.user_id]]
                                 :where     where}))]
      (if (seq raw-value-handler-ids)
        (mdb/select-batched-set #(notification-ids-where [:or user-clause [:in (u/qualified-key (t2/table-name :model/NotificationHandler) :id) %]])
                                raw-value-handler-ids)
        (notification-ids-where user-clause)))))

(mu/defn insert-handlers!
  "Insert the NotificationHandler `handlers` with one statement per distinct set of columns, returning the inserted
  instances in their order."
  [handlers :- [:sequential {:min 1} NotificationHandlerRow]]
  (u/prog1 (mdb/insert-returning-instances! :model/NotificationHandler handlers)
    (change-log/log-changes! :model/NotificationHandler :insert <>)))

(mu/defn recipients-for-handlers
  "The NotificationRecipients of the NotificationHandlers with `handler-ids` (nil entries are ignored)."
  [handler-ids :- [:sequential [:maybe ms/PositiveInt]]]
  (mdb/select-batched #(t2/select :model/NotificationRecipient :notification_handler_id [:in %]) handler-ids))

(mu/defn raw-value-recipients-for-handler
  "The raw-value NotificationRecipients of the NotificationHandler with `handler-id`."
  [handler-id :- ms/PositiveInt]
  (t2/select :model/NotificationRecipient
             :notification_handler_id handler-id
             :type :notification-recipient/raw-value))

(mu/defn raw-value-recipients-reducible
  "Reducible handler IDs and details of every raw-value NotificationRecipient."
  []
  (t2/reducible-select [:model/NotificationRecipient :notification_handler_id :details]
                       :type :notification-recipient/raw-value))

(mu/defn insert-recipients!
  "Insert the NotificationRecipient `recipients` with one statement per distinct set of columns, returning the inserted
  instances in their order."
  [recipients :- [:sequential {:min 1} NotificationRecipientRow]]
  (u/prog1 (mdb/insert-returning-instances! :model/NotificationRecipient recipients)
    (change-log/log-changes! :model/NotificationRecipient :insert <>)))

(mu/defn recipient
  "The NotificationRecipient with `recipient-id`, or nil."
  [recipient-id :- ms/PositiveInt]
  (t2/select-one :model/NotificationRecipient :id recipient-id))

(mu/defn delete-recipients!
  "Delete the NotificationRecipients with `recipient-ids`, returning the number deleted."
  [recipient-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size (fn [chunk]
                                               (change-log/log-rows! :model/NotificationRecipient :delete :id [:in (vec chunk)])
                                               (t2/delete! :model/NotificationRecipient :id [:in (vec chunk)])) recipient-ids))

(mu/defn recipients-for-users
  "The NotificationRecipients of the Users with `user-ids`."
  [user-ids :- [:sequential {:min 1} ::lib.schema.id/user]]
  (mdb/select-batched #(t2/select :model/NotificationRecipient :user_id [:in %]) user-ids))

(mu/defn user-recipients-for-notification
  "The NotificationRecipients for the User with `user-id` on the Notification with `notification-id`."
  [notification-id :- ms/PositiveInt
   user-id         :- ::lib.schema.id/user]
  (t2/select :model/NotificationRecipient
             :user_id user-id
             :notification_handler_id [:in ^:allow-subquery {:select [:id]
                                                             :from   [(t2/table-name :model/NotificationHandler)]
                                                             :where  [:= :notification_id notification-id]}]))

;;; ---------------------------------------------- Channels ----------------------------------------------

(mu/defn active-channels-by-id
  "A map of ID to active Channel for `channel-ids`."
  [channel-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched-map #(t2/select-fn->fn :id identity :model/Channel :id [:in %] :active true) channel-ids))

(mu/defn channel-templates-by-id
  "A map of ID to ChannelTemplate for `template-ids`."
  [template-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched-map #(t2/select-fn->fn :id identity :model/ChannelTemplate :id [:in %]) template-ids))

;;; ---------------------------------------------- Task runs ----------------------------------------------

(def ^:private admin-run-lookback-days
  "How far back to consider alert-type TaskRuns / TaskHistory rows when computing run summaries."
  90)

(defn- admin-lookback-cutoff
  "The earliest `started_at` considered for the admin notification list/detail run history:
  [[admin-run-lookback-days]] days before now, as a Honey SQL form."
  []
  (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- admin-run-lookback-days) :day))

(mu/defn terminal-alert-runs
  "Up to `limit` TaskRuns of `run-type` for the Notification with `notification-id` that reached one of `statuses`
  within the admin lookback window, newest first."
  [run-type        :- :string
   notification-id :- ms/PositiveInt
   statuses        :- [:sequential :string]
   limit           :- ms/PositiveInt]
  (t2/select [:model/TaskRun :id :status :started_at]
             {:where    [:and
                         [:= :run_type run-type]
                         [:= :notification_id notification-id]
                         [:in :status statuses]
                         [:> :started_at (admin-lookback-cutoff)]]
              :order-by [[:started_at :desc] [:id :desc]]
              :limit    limit}))

(mu/defn channel-send-history-reducible
  "Reducible TaskHistory rows of `task` for the runs of `run-type` for the Notification with `notification-id`
  started within the admin lookback window, newest run first with `tr.id` as the tiebreaker so each run's rows stay
  adjacent, capped at 500 rows."
  [run-type        :- :string
   notification-id :- ms/PositiveInt
   task            :- :string]
  (t2/reducible-select :model/TaskHistory
                       {:select   [:th.run_id :th.task_details :th.status
                                   [:tr.started_at :run_started_at]]
                        :from     [[(t2/table-name :model/TaskHistory) :th]]
                        :join     [[(t2/table-name :model/TaskRun) :tr] [:= :tr.id :th.run_id]]
                        :where    [:and
                                   [:= :tr.run_type        run-type]
                                   [:= :tr.notification_id notification-id]
                                   [:= :th.task            task]
                                   [:> :tr.started_at      (admin-lookback-cutoff)]]
                        :order-by [[:tr.started_at :desc] [:tr.id :desc]]
                        :limit    500}))

(mu/defn latest-failed-task-history
  "The `:run_id` and `:task_details` of the single failed/abandoned TaskHistory row per run among `run-ids` (and, if
  given, restricted to `task-name`), preferring rows of `preferred-task` and then the latest by `ended_at`."
  [preferred-task :- :string
   run-ids        :- [:set ms/PositiveInt]
   task-name      :- [:maybe :string]]
  (mdb/select-batched
   #(t2/select :model/TaskHistory
               {:select [:run_id :task_details]
                :from   [[^:allow-subquery
                          {:select [:run_id :task_details
                                    [[:over [[:row_number]
                                             ^:allow-subquery
                                             {:partition-by [:run_id]
                                              :order-by     [[[:case
                                                               [:= :task preferred-task] 0
                                                               :else                     1] :asc]
                                                             [:ended_at :desc]]}]]
                                     :rn]]
                           :from   [(t2/table-name :model/TaskHistory)]
                           :where  [:and
                                    [:in :run_id %]
                                    [:in :status ["failed" "abandoned"]]
                                    (when task-name [:= :task task-name])]}
                          :sub]]
                :where  [:= :sub.rn 1]})
   run-ids))

;;; --------------------------------------------- Admin listing ---------------------------------------------

(def ^:private admin-run-type-alert "alert")
(def ^:private admin-task-channel-send "channel-send")
(def ^:private admin-terminal-statuses ["success" "failed" "abandoned"])

(defn- latest-run-per-notification
  [lookback]
  ^:allow-subquery
  {:select [:id :notification_id :status :started_at :ended_at]
   :from   [[^:allow-subquery
             {:select [:id :notification_id :status :started_at :ended_at
                       [[:over [[:row_number]
                                ^:allow-subquery
                                {:partition-by [:notification_id]
                                 :order-by     [[:started_at :desc]]}]]
                        :rn]]
              :from   [(t2/table-name :model/TaskRun)]
              :where  [:and
                       [:= :run_type admin-run-type-alert]
                       [:is-not :notification_id nil]
                       [:in :status admin-terminal-statuses]
                       [:> :started_at lookback]]}
             :sub]]
   :where  [:= :sub.rn 1]})

(defn- latest-send-tick-per-notification
  [lookback]
  ^:allow-subquery
  {:select [:lr.notification_id
            [:lr.run_id          :id]
            [:lr.tick_started_at :started_at]
            [[:case
              [:exists ^:allow-subquery
               {:select [[1]]
                :from   [[(t2/table-name :model/TaskHistory) :tf]]
                :where  [:and
                         [:= :tf.run_id :lr.run_id]
                         [:= :tf.task admin-task-channel-send]
                         [:= :tf.status "failed"]]}]
              true
              :else false]
             :has_failure]]
   :from   [[^:allow-subquery
             {:select [:tr2.notification_id
                       [:tr2.id         :run_id]
                       [:tr2.started_at :tick_started_at]
                       [[:over [[:row_number]
                                ^:allow-subquery
                                {:partition-by [:tr2.notification_id]
                                 :order-by     [[:tr2.started_at :desc]]}]]
                        :rn]]
              :from   [[(t2/table-name :model/TaskRun) :tr2]]
              :where  [:and
                       [:= :tr2.run_type admin-run-type-alert]
                       [:is-not :tr2.notification_id nil]
                       [:in :tr2.status admin-terminal-statuses]
                       [:> :tr2.started_at lookback]
                       [:exists ^:allow-subquery
                        {:select [[1]]
                         :from   [[(t2/table-name :model/TaskHistory) :tx]]
                         :where  [:and
                                  [:= :tx.run_id :tr2.id]
                                  [:= :tx.task admin-task-channel-send]]}]]}
             :lr]]
   :where [:= :lr.rn 1]})

(defn- admin-sort-column->order-by
  "Maps the public `sort_column` enum to the SQL expression used in `ORDER BY`. Uses raw expressions rather than the
  SELECT aliases because H2 does not resolve aliases inside expressions."
  []
  {:id           :notification.id
   :last_send    :ls.started_at
   :last_check   :lc.started_at
   :card_name    :c.name
   :creator_name [:coalesce :cu.last_name :cu.first_name :cu.email]
   :updated_at   :notification.updated_at})

(defn- admin-channel-exists
  [channels]
  (let [channels (if (sequential? channels) channels [channels])]
    [:exists
     ^:allow-subquery
     {:select [[1]]
      :from   [(t2/table-name :model/NotificationHandler)]
      :where  [:and
               [:= (u/qualified-key (t2/table-name :model/NotificationHandler) :notification_id) :notification.id]
               [:in (u/qualified-key (t2/table-name :model/NotificationHandler) :channel_type) channels]]}]))

(defn- admin-query-where-clause
  [query]
  (let [wildcard (h2x/like-substring query)]
    [:or
     [:like [:lower :c.name]        wildcard]
     [:like [:lower :cu.first_name] wildcard]
     [:like [:lower :cu.last_name]  wildcard]
     [:like [:lower :cu.email]      wildcard]]))

(defn- admin-list-where-clauses
  [{:keys [active creator_id creator_active creatorless card_id recipient_notification_ids channel
           last_send_status last_check_status query]}]
  (keep
   identity
   [(when (some? active)         [:= :notification.active active])
    (when (some? creator_active) [:= :cu.is_active creator_active])
    (when (true? creatorless)
      [:or [:= :notification.creator_id nil] [:= :cu.is_active false]])
    (when (false? creatorless)
      [:and [:is-not :notification.creator_id nil] [:= :cu.is_active true]])
    (when creator_id    [:= :notification.creator_id creator_id])
    (when card_id       [:= :nc.card_id card_id])
    (when (seq channel) (admin-channel-exists channel))
    (when last_send_status
      (case last_send_status
        :successful [:= :ls.has_failure false]
        :failing    [:= :ls.has_failure true]))
    (when last_check_status
      (case last_check_status
        :successful [:= :lc.status "success"]
        :failing    [:in :lc.status ["failed" "abandoned"]]))
    ;; recipient_notification_ids is nil when no recipient_email filter was given, and an empty set when a
    ;; recipient_email filter matched nobody -- in which case the page must come back empty.
    (when recipient_notification_ids
      (if (seq recipient_notification_ids)
        [:in :notification.id recipient_notification_ids]
        [:= 1 0]))
    (when-not (str/blank? query) (admin-query-where-clause query))]))

(defn- admin-base-list-query
  [{:keys [skip-run-joins?] :as filters}]
  (let [lookback (admin-lookback-cutoff)]
    (reduce
     sql.helpers/where
     (cond-> {:select (cond-> [:notification.id
                               :notification.active
                               :notification.creator_id
                               :notification.created_at
                               :notification.updated_at
                               :notification.payload_type
                               :notification.payload_id
                               [:c.name                                           :card_name]
                               [:cu.is_active                                     :creator_is_active]
                               [[:coalesce :cu.last_name :cu.first_name :cu.email] :creator_name]]
                        (not skip-run-joins?)
                        (into [[:lc.id                                            :lc_id]
                               [:lc.status                                        :lc_status]
                               [:lc.started_at                                    :lc_started_at]
                               [:ls.id                                            :ls_id]
                               [:ls.started_at                                    :ls_started_at]
                               [:ls.has_failure                                   :ls_has_failure]]))
              :from   [[(t2/table-name :model/Notification) :notification]]
              :where  [:and
                       [:= :notification.payload_type "notification/card"]
                       [:is-not :notification.payload_id nil]]}

       true
       (-> (sql.helpers/left-join [(t2/table-name :model/NotificationCard) :nc] [:= :nc.id :notification.payload_id])
           (sql.helpers/left-join [(t2/table-name :model/Card) :c]        [:= :c.id :nc.card_id])
           (sql.helpers/left-join [(t2/table-name :model/User) :cu]         [:= :cu.id :notification.creator_id]))

       (not skip-run-joins?)
       (-> (sql.helpers/left-join [(latest-run-per-notification lookback)       :lc] [:= :lc.notification_id :notification.id])
           (sql.helpers/left-join [(latest-send-tick-per-notification lookback) :ls] [:= :ls.notification_id :notification.id])))
     (admin-list-where-clauses filters))))

(defn- admin-order-by-clauses
  [sort-column sort-direction]
  (let [col ((admin-sort-column->order-by) sort-column)
        dir (or sort-direction :desc)]
    [[[:case [:= col nil] 1 :else 0] :asc]
     [col dir]
     [:notification.id :desc]]))

(defn- admin-list-query
  [{:keys [sort_column sort_direction] :as filters}]
  (assoc (admin-base-list-query (dissoc filters :sort_column :sort_direction))
         :order-by (admin-order-by-clauses (or sort_column :last_send) sort_direction)))

(mu/defn admin-notifications-page
  "A page (`limit`/`offset`) of admin notification-list rows matching `filters` (see
  [[metabase.notification.api.admin]] for the supported keys), most-relevant first per `:sort_column`/
  `:sort_direction`."
  [filters :- AdminFilters
   limit   :- ms/PositiveInt
   offset  :- ms/IntGreaterThanOrEqualToZero]
  (t2/select :model/Notification (assoc (admin-list-query filters) :limit limit :offset offset)))

(mu/defn admin-notifications-count
  "The number of admin notification-list rows matching `filters`."
  [filters :- AdminFilters]
  (let [count-matching (fn [filters]
                         (:count (t2/query-one (-> (admin-list-query filters)
                                                   (assoc :select [[[:count :notification.id] :count]])
                                                   (dissoc :order-by)))))
        recipient-ids  (:recipient_notification_ids filters)]
    (if (> (count recipient-ids) mdb/select-partition-size)
      (transduce (map #(count-matching (assoc filters :recipient_notification_ids %)))
                 + 0 (mdb/select-partitions recipient-ids))
      (count-matching filters))))

(mu/defn admin-notification-detail-row
  "The admin notification-list row (skipping the run-summary joins) for the Notification with `notification-id`, or
  nil."
  [notification-id :- ms/PositiveInt]
  (t2/select-one :model/Notification
                 (h2x/assert-map-or-nil!
                  (-> (admin-base-list-query {:skip-run-joins? true})
                      (sql.helpers/where [:= :notification.id notification-id])))))

;;; ------------------------------------------- Other models -------------------------------------------

(mu/defn instance
  "The instance of `model` (a model keyword, or a `[model & columns]` vector) with `id`, or nil."
  [model :- [:or :keyword [:sequential :keyword]]
   id    :- [:maybe ms/PositiveInt]]
  (t2/select-one model :id id))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- [:maybe ::lib.schema.id/card]]
  (t2/select-one :model/Card :id [:auto/param card-id]))

(mu/defn cards
  "The Cards with `card-ids`, a non-empty collection."
  [card-ids :- [:set {:min 1} ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select :model/Card :id [:in [:auto/param %]]) card-ids))

(mu/defn unarchived-card
  "The Card with `card-id` if it is not archived, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id :archived false))

(mu/defn card-name
  "The name of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :name :model/Card :id [:auto/param card-id]))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id [:auto/param dashboard-id]))

(mu/defn dashboard-name
  "The name of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :name :model/Dashboard :id [:auto/param dashboard-id]))

(mu/defn dashboard-tabs
  "The DashboardTabs of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardTab :dashboard_id dashboard-id))

(mu/defn dashboard-tab-count
  "The number of DashboardTabs on the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/count :model/DashboardTab :dashboard_id dashboard-id))

(mu/defn dashcards-for-dashboard
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn user-email
  "The email of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :email [:model/User :email] :id [:auto/param user-id]))

(mu/defn user-summary
  "The ID, names, email, and derived common name of the User with `user-id`, or nil (also for a nil `user-id`, e.g.
  a system-created notification without a creator)."
  [user-id :- [:maybe ::lib.schema.id/user]]
  (t2/select-one [:model/User :id :first_name :last_name :email] :id [:auto/param user-id]))

(mu/defn active-users-by-id
  "A map of ID to active User for `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (mdb/select-batched-map #(t2/select-fn->fn :id identity :model/User :id [:in %] :is_active true) user-ids))
