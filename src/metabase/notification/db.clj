(ns metabase.notification.db
  "Application database queries for the notification module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [toucan2.core :as t2]))

;;; --------------------------------------------- Notification ---------------------------------------------

(defn notification
  "The Notification with `notification-id`, or nil."
  [notification-id]
  (t2/select-one :model/Notification notification-id))

(defn notification-one
  "The first Notification matching the Honey SQL `query`, or nil."
  [query]
  (t2/select-one :model/Notification query))

(defn notification-by-internal-id
  "The seeded Notification with `internal-id`, or nil."
  [internal-id]
  (t2/select-one :model/Notification :internal_id internal-id))

(defn notification-for-handler
  "The Notification owning the NotificationHandler with `handler-id`, or nil."
  [handler-id]
  (t2/select-one :model/Notification
                 :id [:in ^:allow-subquery {:select [:notification_id]
                                            :from   :notification_handler
                                            :where  [:= :id handler-id]}]))

(defn notifications
  "The Notifications matching the Honey SQL `query`."
  [query]
  (t2/select :model/Notification query))

(defn notifications-reducible
  "Reducible Notifications matching the Honey SQL `query`."
  [query]
  (t2/reducible-select :model/Notification query))

(defn notifications-by-id
  "The Notifications with `notification-ids`."
  [notification-ids]
  (t2/select :model/Notification :id [:in notification-ids]))

(defn card-notifications
  "The card Notifications among `notification-ids`."
  [notification-ids]
  (t2/select :model/Notification :id [:in notification-ids] :payload_type :notification/card))

(defn active-card-notifications-for-card
  "The active card Notifications attached to the Card with `card-id`."
  [card-id]
  (t2/select :model/Notification
             :active true
             :payload_type :notification/card
             :payload_id [:in ^:allow-subquery {:select [:id]
                                                :from   [:notification_card]
                                                :where  [:= :card_id card-id]}]))

(defn active-system-event-notifications
  "The active Notifications subscribed to the system event named `event-name`."
  [event-name]
  (t2/select :model/Notification
             {:select    [:n.*]
              :from      [[:notification :n]]
              :left-join [[:notification_subscription :ns] [:= :n.id :ns.notification_id]]
              :where     [:and
                          [:= :n.active true]
                          [:= :ns.event_name event-name]
                          [:= :ns.type "notification-subscription/system-event"]]}))

(defn notification-count-row
  "The single row of the Honey SQL count `query`."
  [query]
  (t2/query-one query))

(defn insert-notification!
  "Insert `notification` and return the new instance."
  [notification]
  (t2/insert-returning-instance! :model/Notification notification))

(defn update-card-notifications!
  "Apply `changes` to the card Notifications among `notification-ids`."
  [notification-ids changes]
  (t2/update! :model/Notification :id [:in notification-ids] :payload_type :notification/card changes))

(defn deactivate-notification!
  "Mark the Notification with `notification-id` inactive."
  [notification-id]
  (t2/update! :model/Notification notification-id {:active false}))

(defn delete-notification!
  "Delete the Notification with `notification-id`."
  [notification-id]
  (t2/delete! :model/Notification notification-id))

(defn delete-notifications!
  "Delete the Notifications with `notification-ids`."
  [notification-ids]
  (t2/delete! :model/Notification :id [:in notification-ids]))

(defn delete-notification-by-internal-id!
  "Delete the seeded Notification with `internal-id`."
  [internal-id]
  (t2/delete! :model/Notification :internal_id internal-id))

;;; ------------------------------------------- NotificationCard -------------------------------------------

(defn notification-cards
  "The NotificationCards with `notification-card-ids`."
  [notification-card-ids]
  (t2/select :model/NotificationCard :id [:in notification-card-ids]))

(defn notification-card-exists?
  "Whether a NotificationCard with `notification-card-id` exists."
  [notification-card-id]
  (t2/exists? :model/NotificationCard notification-card-id))

(defn notification-card-card-id
  "The `:card_id` of the NotificationCard with `notification-card-id`."
  [notification-card-id]
  (t2/select-one-fn :card_id :model/NotificationCard :id notification-card-id))

(defn insert-notification-card!
  "Insert `notification-card` and return its ID."
  [notification-card]
  (t2/insert-returning-pk! :model/NotificationCard notification-card))

(defn delete-notification-card!
  "Delete the NotificationCard with `notification-card-id`."
  [notification-card-id]
  (t2/delete! :model/NotificationCard notification-card-id))

;;; --------------------------------------- NotificationSubscription ---------------------------------------

(defn subscription
  "The NotificationSubscription with `subscription-id`, or nil."
  [subscription-id]
  (t2/select-one :model/NotificationSubscription subscription-id))

(defn subscriptions-for-notifications
  "The NotificationSubscriptions of the Notifications with `notification-ids`."
  [notification-ids]
  (t2/select :model/NotificationSubscription :notification_id [:in notification-ids]))

(defn cron-subscriptions-for-notification
  "The cron NotificationSubscriptions of the Notification with `notification-id`."
  [notification-id]
  (t2/select :model/NotificationSubscription
             :notification_id notification-id
             :type :notification-subscription/cron))

(defn cron-subscription-ids-for-notification
  "The IDs of the cron NotificationSubscriptions of the Notification with `notification-id`."
  [notification-id]
  (t2/select-pks-set :model/NotificationSubscription
                     :notification_id notification-id
                     :type :notification-subscription/cron))

(defn active-cron-subscriptions-by-id
  "A map of ID to cron NotificationSubscription for every active Notification."
  []
  (t2/select-pk->fn identity :model/NotificationSubscription
                    :type :notification-subscription/cron
                    {:select [:ns.*]
                     :from   [[:notification_subscription :ns]]
                     :join   [[:notification :n] [:= :ns.notification_id :n.id]]
                     :where  [:and
                              [:= :ns.type "notification-subscription/cron"]
                              [:= :n.active true]]}))

(defn insert-subscriptions!
  "Insert the NotificationSubscription `subscriptions`."
  [subscriptions]
  (t2/insert! :model/NotificationSubscription subscriptions))

;;; ------------------------------------ NotificationHandler / Recipient ------------------------------------

(defn handlers-for-notifications
  "The NotificationHandlers of the Notifications with `notification-ids`."
  [notification-ids]
  (t2/select :model/NotificationHandler :notification_id [:in notification-ids]))

(defn handler-notification-ids-where
  "The set of Notification IDs of the handlers whose recipients, joined to their user, match the Honey SQL `where`."
  [where]
  (t2/select-fn-set :notification_id (t2/table-name :model/NotificationHandler)
                    {:join      [[(t2/table-name :model/NotificationRecipient) :nr]
                                 [:= :nr.notification_handler_id :notification_handler.id]]
                     :left-join [[:core_user :cu] [:= :cu.id :nr.user_id]]
                     :where     where}))

(defn insert-handler!
  "Insert `handler` and return its ID."
  [handler]
  (t2/insert-returning-pk! :model/NotificationHandler handler))

(defn recipients-for-handlers
  "The NotificationRecipients of the NotificationHandlers with `handler-ids`."
  [handler-ids]
  (t2/select :model/NotificationRecipient :notification_handler_id [:in handler-ids]))

(defn raw-value-recipients-for-handler
  "The raw-value NotificationRecipients of the NotificationHandler with `handler-id`."
  [handler-id]
  (t2/select :model/NotificationRecipient
             :notification_handler_id handler-id
             :type :notification-recipient/raw-value))

(defn raw-value-recipients-reducible
  "Reducible handler IDs and details of every raw-value NotificationRecipient."
  []
  (t2/reducible-select [:model/NotificationRecipient :notification_handler_id :details]
                       :type :notification-recipient/raw-value))

(defn insert-recipients!
  "Insert one NotificationRecipient map or a sequence of them."
  [recipients]
  (t2/insert! :model/NotificationRecipient recipients))

(defn delete-recipient!
  "Delete the NotificationRecipient with `recipient-id`."
  [recipient-id]
  (t2/delete! :model/NotificationRecipient recipient-id))

(defn delete-user-recipients-for-notification!
  "Delete the NotificationRecipients for the User with `user-id` on the Notification with `notification-id`."
  [notification-id user-id]
  (t2/delete! :model/NotificationRecipient
              :user_id user-id
              :notification_handler_id [:in ^:allow-subquery {:select [:id]
                                                              :from   [:notification_handler]
                                                              :where  [:= :notification_id notification-id]}]))

;;; ---------------------------------------------- Channels ----------------------------------------------

(defn active-channels-by-id
  "A map of ID to active Channel for `channel-ids`."
  [channel-ids]
  (t2/select-fn->fn :id identity :model/Channel :id [:in channel-ids] :active true))

(defn channel-templates-by-id
  "A map of ID to ChannelTemplate for `template-ids`."
  [template-ids]
  (t2/select-fn->fn :id identity :model/ChannelTemplate :id [:in template-ids]))

(defn channel-template-channel-type
  "The `:channel_type` of the ChannelTemplate with `template-id`."
  [template-id]
  (t2/select-one-fn :channel_type [:model/ChannelTemplate :channel_type] template-id))

(defn insert-channel-template!
  "Insert `template` and return its ID."
  [template]
  (t2/insert-returning-pk! :model/ChannelTemplate template))

(defn delete-channel-templates!
  "Delete the ChannelTemplates with `template-ids`."
  [template-ids]
  (t2/delete! :model/ChannelTemplate :id [:in template-ids]))

;;; ---------------------------------------------- Task runs ----------------------------------------------

(defn terminal-alert-runs
  "Up to `limit` TaskRuns of `run-type` for the Notification with `notification-id` that reached one of `statuses`
  after `cutoff`, newest first."
  [run-type notification-id statuses cutoff limit]
  (t2/select [:model/TaskRun :id :status :started_at]
             {:where    [:and
                         [:= :run_type run-type]
                         [:= :notification_id notification-id]
                         [:in :status statuses]
                         [:> :started_at cutoff]]
              :order-by [[:started_at :desc] [:id :desc]]
              :limit    limit}))

(defn channel-send-history-reducible
  "Reducible TaskHistory rows of `task` for the runs of `run-type` for the Notification with `notification-id`
  started after `cutoff`, newest run first with `tr.id` as the tiebreaker so each run's rows stay adjacent, capped
  at 500 rows."
  [run-type notification-id task cutoff]
  (t2/reducible-select :model/TaskHistory
                       {:select   [:th.run_id :th.task_details :th.status
                                   [:tr.started_at :run_started_at]]
                        :from     [[:task_history :th]]
                        :join     [[:task_run :tr] [:= :tr.id :th.run_id]]
                        :where    [:and
                                   [:= :tr.run_type        run-type]
                                   [:= :tr.notification_id notification-id]
                                   [:= :th.task            task]
                                   [:> :tr.started_at      cutoff]]
                        :order-by [[:tr.started_at :desc] [:tr.id :desc]]
                        :limit    500}))

(defn latest-failed-task-history-rows
  "The `:run_id` and `:task_details` of the single TaskHistory row per run matching the Honey SQL `where`, preferring
  rows of `preferred-task` and then the latest by `ended_at`."
  [preferred-task where]
  (t2/select :model/TaskHistory
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
                         :from   [:task_history]
                         :where  where}
                        :sub]]
              :where  [:= :sub.rn 1]}))

;;; ------------------------------------------- Other models -------------------------------------------

(defn instance
  "The instance of `model` with `id`, or nil."
  [model id]
  (t2/select-one model id))

(defn link-card-entity
  "The instance of `model` matching the Honey SQL `query` that a link card points at, or nil."
  [model query]
  (t2/select-one model query))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card card-id))

(defn unarchived-card
  "The Card with `card-id` if it is not archived, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id :archived false))

(defn card-name
  "The name of the Card with `card-id`."
  [card-id]
  (t2/select-one-fn :name :model/Card card-id))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard dashboard-id))

(defn dashboard-name
  "The name of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-one-fn :name :model/Dashboard dashboard-id))

(defn dashboard-tabs
  "The DashboardTabs of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select :model/DashboardTab :dashboard_id dashboard-id))

(defn dashboard-tab-count
  "The number of DashboardTabs on the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/count :model/DashboardTab :dashboard_id dashboard-id))

(defn dashcards-for-dashboard
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(defn user-email
  "The email of the User with `user-id`."
  [user-id]
  (t2/select-one-fn :email [:model/User :email] user-id))

(defn user-summary
  "The ID, names, and email of the User with `user-id`."
  [user-id]
  (t2/select-one [:model/User :id :first_name :last_name :email] user-id))

(defn active-users-by-id
  "A map of ID to active User for `user-ids`."
  [user-ids]
  (t2/select-fn->fn :id identity :model/User :id [:in user-ids] :is_active true))
