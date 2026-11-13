(ns metabase.help-assistant.db
  "App DB queries for the Help assistant's checks of this instance. They select only columns that are safe to send to
  the AI provider: never connection details."
  (:require
   [java-time.api :as t]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private sync-tasks
  "The task history names of whole sync operations."
  ["sync" "analyze" "field values scanning" "refingerprint database"])

(defn databases
  "Every database except the audit database, by id, without connection details."
  []
  (t2/select [:model/Database :id :name :engine :initial_sync_status :is_sample]
             :is_audit false
             {:order-by [[:id :asc]]}))

(defn last-successful-sync
  "When the most recent successful sync of database `db-id` finished, or nil."
  [db-id]
  (t2/select-one-fn :ended_at [:model/TaskHistory :ended_at]
                    :db_id db-id, :task "sync", :status :success
                    {:order-by [[:ended_at :desc]]}))

(defn running-sync-tasks
  "Names of the sync operations of database `db-id` that started in the last day and haven't finished."
  [db-id]
  (t2/select-fn-set :task [:model/TaskHistory :task]
                    :db_id db-id, :task [:in sync-tasks], :status :started
                    :started_at [:> (t/minus (t/offset-date-time) (t/days 1))]))

(defn recent-sync-failures
  "Up to `n` sync steps of database `db-id` that failed in the last 7 days, most recent first, as
  `{:task :started_at :message}`."
  [db-id n]
  (for [{:keys [task started_at task_details]} (t2/select [:model/TaskHistory :task :started_at :task_details]
                                                          :db_id db-id, :status :failed
                                                          :started_at [:> (t/minus (t/offset-date-time) (t/days 7))]
                                                          {:order-by [[:started_at :desc]], :limit n})]
    {:task task, :started_at started_at, :message (:message task_details)}))

;;; ------------------------------------------- Subscriptions and alerts -------------------------------------------

(defn- by-id
  "`{id row}` for the rows of `model` (a `[model & columns]` vector) with these ids. Empty without querying when there are
  no ids."
  [model ids]
  (if (empty? ids)
    {}
    (into {} (map (juxt :id identity)) (t2/select model :id [:in (set ids)]))))

(defn- user-emails [user-ids]
  (update-vals (by-id [:model/User :id :email] (remove nil? user-ids)) :email))

(defn dashboard-subscriptions
  "Dashboard subscriptions that aren't archived, each with its dashboard and channels. A channel has its type, whether
  it's enabled, its schedule keys, the email addresses it sends to and its Slack channel name. Nothing else from the
  channel's details."
  []
  (let [pulses     (t2/select [:model/Pulse :id :name :dashboard_id]
                              :archived false, :dashboard_id [:not= nil]
                              {:order-by [[:id :asc]]})
        dashboards (by-id [:model/Dashboard :id :name :archived] (map :dashboard_id pulses))
        channels   (when (seq pulses)
                     (t2/select [:model/PulseChannel :id :pulse_id :channel_type :enabled :details
                                 :schedule_type :schedule_hour :schedule_day :schedule_frame]
                                :pulse_id [:in (map :id pulses)]
                                {:order-by [[:id :asc]]}))
        recipients (when (seq channels)
                     (t2/select [:model/PulseChannelRecipient :pulse_channel_id :user_id]
                                :pulse_channel_id [:in (map :id channels)]))
        emails     (user-emails (map :user_id recipients))
        user-ids   (update-vals (group-by :pulse_channel_id recipients) #(map :user_id %))
        channels   (group-by :pulse_id
                             (for [{:keys [id details] :as channel} channels]
                               (-> channel
                                   (select-keys [:pulse_id :channel_type :enabled :schedule_type :schedule_hour
                                                 :schedule_day :schedule_frame])
                                   (assoc :emails        (vec (concat (keep emails (user-ids id)) (:emails details)))
                                          :slack-channel (:channel details)))))]
    (for [{:keys [id name dashboard_id]} pulses]
      {:id        id
       :name      name
       :dashboard (get dashboards dashboard_id)
       :channels  (get channels id [])})))

(defn alerts
  "Question alerts, each with its question, condition, cron schedules and handlers. A handler has its channel type,
  whether it's active, the email addresses it sends to, the names of the groups it sends to and its Slack channel."
  []
  (let [notifications (t2/select [:model/Notification :id :payload_id :active]
                                 :payload_type :notification/card
                                 {:order-by [[:id :asc]]})
        ids           (map :id notifications)
        payloads      (by-id [:model/NotificationCard :id :card_id :send_condition :send_once]
                             (map :payload_id notifications))
        cards         (by-id [:model/Card :id :name :archived] (map :card_id (vals payloads)))
        schedules     (when (seq ids)
                        (group-by :notification_id
                                  (t2/select [:model/NotificationSubscription :notification_id :cron_schedule]
                                             :notification_id [:in ids]
                                             :type :notification-subscription/cron)))
        handlers      (when (seq ids)
                        (t2/select [:model/NotificationHandler :id :notification_id :channel_type :active]
                                   :notification_id [:in ids]))
        recipients    (when (seq handlers)
                        (t2/select [:model/NotificationRecipient :notification_handler_id :type :user_id
                                    :permissions_group_id :details]
                                   :notification_handler_id [:in (map :id handlers)]))
        emails        (user-emails (map :user_id recipients))
        groups        (update-vals (by-id [:model/PermissionsGroup :id :name]
                                          (keep :permissions_group_id recipients))
                                   :name)
        recipients    (group-by :notification_handler_id recipients)
        handlers      (group-by :notification_id
                                (for [{:keys [id channel_type active]} handlers
                                      :let [rs  (get recipients id)
                                            raw (keep #(when (= :notification-recipient/raw-value (:type %))
                                                         (get-in % [:details :value]))
                                                      rs)]]
                                  {:channel_type  channel_type
                                   :active        active
                                   :emails        (vec (concat (keep (comp emails :user_id) rs)
                                                               (when (not= :channel/slack channel_type) raw)))
                                   :groups        (vec (keep (comp groups :permissions_group_id) rs))
                                   :slack-channel (when (= :channel/slack channel_type) (first raw))}))]
    (for [{:keys [id payload_id active]} notifications
          :let [payload (get payloads payload_id)]]
      {:id             id
       :active         active
       :card           (get cards (:card_id payload))
       :send_condition (:send_condition payload)
       :send_once      (:send_once payload)
       :schedules      (map :cron_schedule (get schedules id))
       :handlers       (get handlers id [])})))

(defn recent-send-failures
  "Up to `n` subscription or alert sends that failed in the last 7 days, most recent first, as
  `{:task :started_at :message :notification_id :notification_type}`."
  [n]
  (for [{:keys [task started_at task_details]} (t2/select [:model/TaskHistory :task :started_at :task_details]
                                                          :task [:in ["notification-send" "channel-send"]]
                                                          :status :failed
                                                          :started_at [:> (t/minus (t/offset-date-time) (t/days 7))]
                                                          {:order-by [[:started_at :desc]], :limit n})
        :let [info (merge (:original-info task_details) (dissoc task_details :original-info))]]
    {:task              task
     :started_at        started_at
     :message           (:message task_details)
     :notification_id   (:notification_id info)
     :notification_type (:notification_type info)}))
