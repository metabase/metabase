(ns metabase.notification.db
  "Application database queries for the notification module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

;;; --------------------------------------------- Notification ---------------------------------------------

(defn notification
  "The Notification with `notification-id`, or nil."
  [notification-id]
  (t2/select-one :model/Notification notification-id))

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

(defn notifications-matching
  "Reducible Notifications, optionally narrowed to `creator-id`, `creator-or-recipient-id` (a User who is either the
  creator or a recipient), `recipient-id`, `card-id`, and `payload-type`; active Notifications only unless
  `include-inactive?` or `legacy-active` (a boolean, overriding both) is given. `legacy-user-id` narrows to a User
  who is either the creator or a recipient."
  [{:keys [creator-id creator-or-recipient-id recipient-id card-id payload-type include-inactive? legacy-active
           legacy-user-id]}]
  (t2/reducible-select
   :model/Notification
   (cond-> {:select-distinct [:notification.*]}
     creator-id
     (sql.helpers/where [:= :notification.creator_id creator-id])

     recipient-id
     (-> (sql.helpers/left-join
          :notification_handler [:= :notification_handler.notification_id :notification.id])
         (sql.helpers/left-join
          :notification_recipient [:= :notification_recipient.notification_handler_id :notification_handler.id])
         (sql.helpers/where [:= :notification_recipient.user_id recipient-id]))

     creator-or-recipient-id
     (-> (sql.helpers/left-join
          :notification_handler [:= :notification_handler.notification_id :notification.id])
         (sql.helpers/left-join
          :notification_recipient [:= :notification_recipient.notification_handler_id :notification_handler.id])
         (sql.helpers/where [:or [:= :notification_recipient.user_id creator-or-recipient-id]
                             [:= :notification.creator_id creator-or-recipient-id]]))

     card-id
     (-> (sql.helpers/left-join
          :notification_card
          [:and
           [:= :notification_card.id :notification.payload_id]
           [:= :notification.payload_type "notification/card"]])
         (sql.helpers/where [:= :notification_card.card_id card-id]))

     (and (nil? legacy-active) (not (true? include-inactive?)))
     (sql.helpers/where [:= :notification.active true])

     payload-type
     (sql.helpers/where [:= :notification.payload_type (u/qualified-name payload-type)])

     (some? legacy-active)
     (sql.helpers/where [:= :notification.active legacy-active])

     legacy-user-id
     (-> (sql.helpers/left-join
          :notification_handler [:= :notification_handler.notification_id :notification.id])
         (sql.helpers/left-join
          :notification_recipient [:= :notification_recipient.notification_handler_id :notification_handler.id])
         (sql.helpers/where [:or
                             [:= :notification_recipient.user_id legacy-user-id]
                             [:= :notification.creator_id legacy-user-id]])))))

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

(defn handler-notification-ids-for-email
  "The set of Notification IDs of the handlers whose recipients (joined to their user) have an exact, lower-cased
  `email` match, either directly (via the recipient's User) or among `raw-value-handler-ids` (handler IDs already
  known to have a matching raw-value recipient)."
  [lower-email raw-value-handler-ids]
  (let [user-clause [:and
                     [:= :nr.type "notification-recipient/user"]
                     [:= [:lower :cu.email] lower-email]]]
    (t2/select-fn-set :notification_id (t2/table-name :model/NotificationHandler)
                      {:join      [[(t2/table-name :model/NotificationRecipient) :nr]
                                   [:= :nr.notification_handler_id :notification_handler.id]]
                       :left-join [[:core_user :cu] [:= :cu.id :nr.user_id]]
                       :where     (if (seq raw-value-handler-ids)
                                    [:or user-clause [:in :notification_handler.id raw-value-handler-ids]]
                                    user-clause)})))

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

(defn latest-failed-task-history
  "The `:run_id` and `:task_details` of the single failed/abandoned TaskHistory row per run among `run-ids` (and, if
  given, restricted to `task-name`), preferring rows of `preferred-task` and then the latest by `ended_at`."
  [preferred-task run-ids task-name]
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
                         :where  [:and
                                  [:in :run_id run-ids]
                                  [:in :status ["failed" "abandoned"]]
                                  (when task-name [:= :task task-name])]}
                        :sub]]
              :where  [:= :sub.rn 1]}))

;;; --------------------------------------------- Admin listing ---------------------------------------------

(def ^:private admin-run-type-alert "alert")
(def ^:private admin-task-channel-send "channel-send")
(def ^:private admin-terminal-statuses ["success" "failed" "abandoned"])

(def ^:private admin-run-lookback-days
  "How far back to consider alert-type TaskRuns / TaskHistory rows when computing run summaries."
  90)

(defn admin-lookback-cutoff
  "The earliest `started_at` considered for the admin notification list/detail run history:
  [[admin-run-lookback-days]] days before now."
  []
  (h2x/add-interval-honeysql-form (mdb/db-type) (mi/now) (- admin-run-lookback-days) :day))

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
              :from   [:task_run]
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
                :from   [[:task_history :tf]]
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
              :from   [[:task_run :tr2]]
              :where  [:and
                       [:= :tr2.run_type admin-run-type-alert]
                       [:is-not :tr2.notification_id nil]
                       [:in :tr2.status admin-terminal-statuses]
                       [:> :tr2.started_at lookback]
                       [:exists ^:allow-subquery
                        {:select [[1]]
                         :from   [[:task_history :tx]]
                         :where  [:and
                                  [:= :tx.run_id :tr2.id]
                                  [:= :tx.task admin-task-channel-send]]}]]}
             :lr]]
   :where [:= :lr.rn 1]})

(def ^:private admin-sort-column->order-by
  "Maps the public `sort_column` enum to the SQL expression used in `ORDER BY`. Uses raw expressions rather than the
  SELECT aliases because H2 does not resolve aliases inside expressions."
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
               [:= :notification_handler.notification_id :notification.id]
               [:in :notification_handler.channel_type channels]]}]))

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
              :from   [:notification]
              :where  [:and
                       [:= :notification.payload_type "notification/card"]
                       [:is-not :notification.payload_id nil]]}

       true
       (-> (sql.helpers/left-join [:notification_card :nc] [:= :nc.id :notification.payload_id])
           (sql.helpers/left-join [:report_card :c]        [:= :c.id :nc.card_id])
           (sql.helpers/left-join [:core_user :cu]         [:= :cu.id :notification.creator_id]))

       (not skip-run-joins?)
       (-> (sql.helpers/left-join [(latest-run-per-notification lookback)       :lc] [:= :lc.notification_id :notification.id])
           (sql.helpers/left-join [(latest-send-tick-per-notification lookback) :ls] [:= :ls.notification_id :notification.id])))
     (admin-list-where-clauses filters))))

(defn- admin-order-by-clauses
  [sort-column sort-direction]
  (let [col (admin-sort-column->order-by sort-column)
        dir (or sort-direction :desc)]
    [[[:case [:= col nil] 1 :else 0] :asc]
     [col dir]
     [:notification.id :desc]]))

(defn- admin-list-query
  [{:keys [sort_column sort_direction] :as filters}]
  (assoc (admin-base-list-query (dissoc filters :sort_column :sort_direction))
         :order-by (admin-order-by-clauses (or sort_column :last_send) sort_direction)))

(defn admin-notifications-page
  "A page (`limit`/`offset`) of admin notification-list rows matching `filters` (see
  [[metabase.notification.api.admin]] for the supported keys), most-relevant first per `:sort_column`/
  `:sort_direction`."
  [filters limit offset]
  (t2/select :model/Notification (assoc (admin-list-query filters) :limit limit :offset offset)))

(defn admin-notifications-count
  "The number of admin notification-list rows matching `filters`."
  [filters]
  (:count (t2/query-one (-> (admin-list-query filters)
                            (assoc :select [[[:count :notification.id] :count]])
                            (dissoc :order-by)))))

(defn admin-notification-detail-row
  "The admin notification-list row (skipping the run-summary joins) for the Notification with `notification-id`, or
  nil."
  [notification-id]
  (t2/select-one :model/Notification
                 (-> (admin-base-list-query {:skip-run-joins? true})
                     (sql.helpers/where [:= :notification.id notification-id]))))

;;; ------------------------------------------- Other models -------------------------------------------

(defn instance
  "The instance of `model` with `id`, or nil."
  [model id]
  (t2/select-one model id))

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
