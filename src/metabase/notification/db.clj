(ns metabase.notification.db
  "Application database queries for the notification module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.notification.schema :as notification.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

;;; The queries below follow the `::opts` schemas per model; queries that do not fit them live in the
;;; notification-only section at the bottom of this namespace.

(mr/def ::notification-filters
  "Which Notifications a query applies to. Keys mirror the columns of `notification`: a scalar matches that value
  and a set matches any of its values."
  [:map {:closed true}
   [:id           {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:internal_id  {:optional true} :string]
   [:payload_type {:optional true} [:or :keyword :string]]])

(mr/def ::notification-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::notification-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::notification.schema/notification.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::notification.schema/notification.column
                                              [:tuple ::notification.schema/notification.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->notification-model
  [columns]
  (u.query/model-with-columns :model/Notification columns))

(defn- ->notification-args
  [opts]
  (u.query/opts->args opts))

(mr/def ::notification-card-filters
  "Which NotificationCards a query applies to. Keys mirror the columns of `notification_card`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::notification-card-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::notification-card-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::notification.schema/notification-card.column]]]])

(defn- ->notification-card-model
  [columns]
  (u.query/model-with-columns :model/NotificationCard columns))

(defn- ->notification-card-args
  [opts]
  (u.query/opts->args opts))

(mr/def ::notification-handler-filters
  "Which NotificationHandlers a query applies to. Keys mirror the columns of `notification_handler`: a scalar
  matches that value and a set matches any of its values. A `nil` entry in the set is harmless -- it never matches
  a row -- so callers building the set from possibly-unsaved parent rows need not filter it out."
  [:map {:closed true}
   [:notification_id {:optional true} [:or ms/PositiveInt [:set [:maybe ms/PositiveInt]]]]])

(mr/def ::notification-handler-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::notification-handler-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::notification.schema/notification-handler.column]]]])

(defn- ->notification-handler-model
  [columns]
  (u.query/model-with-columns :model/NotificationHandler columns))

(defn- ->notification-handler-args
  [opts]
  (u.query/opts->args opts))

(mr/def ::notification-recipient-filters
  "Which NotificationRecipients a query applies to. Keys mirror the columns of `notification_recipient`: a scalar
  matches that value and a set matches any of its values. A `nil` entry in `:notification_handler_id`'s set is
  harmless -- it never matches a row -- so callers building the set from possibly-unsaved parent rows need not
  filter it out."
  [:map {:closed true}
   [:id                      {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:notification_handler_id {:optional true} [:or ms/PositiveInt [:set [:maybe ms/PositiveInt]]]]
   [:type                    {:optional true} [:or :keyword :string]]])

(mr/def ::notification-recipient-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::notification-recipient-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::notification.schema/notification-recipient.column]]]])

(defn- ->notification-recipient-model
  [columns]
  (u.query/model-with-columns :model/NotificationRecipient columns))

(defn- ->notification-recipient-args
  [opts]
  (u.query/opts->args opts))

(mr/def ::notification-subscription-filters
  "Which NotificationSubscriptions a query applies to. Keys mirror the columns of `notification_subscription`: a
  scalar matches that value and a set matches any of its values. A `nil` entry in `:notification_id`'s set is
  harmless -- it never matches a row -- so callers building the set from possibly-unsaved parent rows need not
  filter it out."
  [:map {:closed true}
   [:id              {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:notification_id {:optional true} [:or ms/PositiveInt [:set [:maybe ms/PositiveInt]]]]
   [:type            {:optional true} [:or :keyword :string]]])

(mr/def ::notification-subscription-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::notification-subscription-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::notification.schema/notification-subscription.column]]]])

(defn- ->notification-subscription-model
  [columns]
  (u.query/model-with-columns :model/NotificationSubscription columns))

(defn- ->notification-subscription-args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-notifications :- [:sequential ::notification.schema/notification.partial]
  "The Notifications matching `opts`."
  ([]
   (select-notifications nil))
  ([{:keys [columns] :as opts} :- [:maybe ::notification-opts]]
   (apply t2/select (->notification-model columns) (->notification-args opts))))

(mu/defn select-one-notification :- [:maybe ::notification.schema/notification.partial]
  "The first Notification matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::notification-opts]]
  (apply t2/select-one (->notification-model columns) (->notification-args opts)))

(mu/defn select-notification-cards :- [:sequential ::notification.schema/notification-card.partial]
  "The NotificationCards matching `opts`."
  ([]
   (select-notification-cards nil))
  ([{:keys [columns] :as opts} :- [:maybe ::notification-card-opts]]
   (apply t2/select (->notification-card-model columns) (->notification-card-args opts))))

(mu/defn select-one-notification-card :- [:maybe ::notification.schema/notification-card.partial]
  "The first NotificationCard matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::notification-card-opts]]
  (apply t2/select-one (->notification-card-model columns) (->notification-card-args opts)))

(mu/defn notification-card-exists? :- :boolean
  "Whether a NotificationCard matching `opts` exists."
  [opts :- [:maybe ::notification-card-opts]]
  (apply t2/exists? :model/NotificationCard (->notification-card-args opts)))

(mu/defn select-notification-handlers :- [:sequential ::notification.schema/notification-handler.partial]
  "The NotificationHandlers matching `opts`."
  ([]
   (select-notification-handlers nil))
  ([{:keys [columns] :as opts} :- [:maybe ::notification-handler-opts]]
   (apply t2/select (->notification-handler-model columns) (->notification-handler-args opts))))

(mu/defn select-notification-recipients :- [:sequential ::notification.schema/notification-recipient.partial]
  "The NotificationRecipients matching `opts`."
  ([]
   (select-notification-recipients nil))
  ([{:keys [columns] :as opts} :- [:maybe ::notification-recipient-opts]]
   (apply t2/select (->notification-recipient-model columns) (->notification-recipient-args opts))))

(mu/defn reducible-select-notification-recipients
  "A reducible of the NotificationRecipients matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::notification-recipient-opts]]
  (apply t2/reducible-select (->notification-recipient-model columns) (->notification-recipient-args opts)))

(mu/defn select-one-notification-subscription :- [:maybe ::notification.schema/notification-subscription.partial]
  "The first NotificationSubscription matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::notification-subscription-opts]]
  (apply t2/select-one (->notification-subscription-model columns) (->notification-subscription-args opts)))

(mu/defn select-notification-subscriptions :- [:sequential ::notification.schema/notification-subscription.partial]
  "The NotificationSubscriptions matching `opts`."
  ([]
   (select-notification-subscriptions nil))
  ([{:keys [columns] :as opts} :- [:maybe ::notification-subscription-opts]]
   (apply t2/select (->notification-subscription-model columns) (->notification-subscription-args opts))))

(mu/defn select-notification-subscription-pks :- [:set ms/PositiveInt]
  "The ids of the NotificationSubscriptions matching `opts`."
  [opts :- [:maybe ::notification-subscription-opts]]
  (or (apply t2/select-pks-set :model/NotificationSubscription (->notification-subscription-args opts)) #{}))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-notification! :- ::notification.schema/notification
  "Insert `notification` and return the new instance."
  [notification :- ::notification.schema/notification.create]
  (t2/insert-returning-instance! :model/Notification notification))

(mu/defn update-notifications! :- :int
  "Apply `changes` to every Notification matching `opts`, returning the number updated."
  [opts    :- [:maybe ::notification-opts]
   changes :- ::notification.schema/notification.update]
  (apply t2/update! :model/Notification (conj (u.query/opts->kv-args opts) changes)))

(mu/defn delete-notifications! :- :int
  "Delete every Notification matching `opts`, returning the number deleted."
  [opts :- [:maybe ::notification-opts]]
  (apply t2/delete! :model/Notification (->notification-args opts)))

(mu/defn insert-notification-card! :- ms/PositiveInt
  "Insert `notification-card` and return its id."
  [notification-card :- ::notification.schema/notification-card.create]
  (t2/insert-returning-pk! :model/NotificationCard notification-card))

(mu/defn delete-notification-cards! :- :int
  "Delete every NotificationCard matching `opts`, returning the number deleted."
  [opts :- [:maybe ::notification-card-opts]]
  (apply t2/delete! :model/NotificationCard (->notification-card-args opts)))

(mu/defn insert-notification-handler! :- ms/PositiveInt
  "Insert `handler` and return its id."
  [handler :- ::notification.schema/notification-handler.create]
  (t2/insert-returning-pk! :model/NotificationHandler handler))

(mu/defn insert-notification-recipients! :- :int
  "Insert one NotificationRecipient map or a sequence of them, returning the number inserted."
  [recipients :- [:or
                  ::notification.schema/notification-recipient.create
                  [:sequential ::notification.schema/notification-recipient.create]]]
  (t2/insert! :model/NotificationRecipient recipients))

(mu/defn delete-notification-recipients! :- :int
  "Delete every NotificationRecipient matching `opts`, returning the number deleted."
  [opts :- [:maybe ::notification-recipient-opts]]
  (apply t2/delete! :model/NotificationRecipient (->notification-recipient-args opts)))

(mu/defn insert-notification-subscriptions! :- :int
  "Insert the NotificationSubscription `subscriptions`, returning the number inserted."
  [subscriptions :- [:sequential ::notification.schema/notification-subscription.create]]
  (t2/insert! :model/NotificationSubscription subscriptions))

;;; ------------------------------------------- Queries used only by the notification module -------------------------------------------

(def ^:private AdminFilters
  "The filters accepted by [[select-admin-notifications-page]] and [[count-admin-notifications]]."
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

(mu/defn select-notification-for-handler
  "The Notification owning the NotificationHandler with `handler-id`, or nil."
  [handler-id :- ms/PositiveInt]
  (t2/select-one :model/Notification
                 :id [:in ^:allow-subquery {:select [:notification_id]
                                            :from   :notification_handler
                                            :where  [:= :id handler-id]}]))

(mu/defn select-notifications-matching
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

(mu/defn select-active-card-notifications-for-card
  "The active card Notifications attached to the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select :model/Notification
             :active true
             :payload_type :notification/card
             :payload_id [:in ^:allow-subquery {:select [:id]
                                                :from   [:notification_card]
                                                :where  [:= :card_id card-id]}]))

(mu/defn select-active-system-event-notifications
  "The active Notifications subscribed to the system event named `event-name`."
  [event-name :- :string]
  (t2/select :model/Notification
             {:select    [:n.*]
              :from      [[:notification :n]]
              :left-join [[:notification_subscription :ns] [:= :n.id :ns.notification_id]]
              :where     [:and
                          [:= :n.active true]
                          [:= :ns.event_name event-name]
                          [:= :ns.type "notification-subscription/system-event"]]}))

(mu/defn select-active-cron-subscriptions-by-id
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

(mu/defn select-handler-notification-ids-for-email :- [:set ms/PositiveInt]
  "The set of Notification IDs of the handlers whose recipients (joined to their user) have an exact, lower-cased
  `email` match, either directly (via the recipient's User) or among `raw-value-handler-ids` (handler IDs already
  known to have a matching raw-value recipient)."
  [lower-email           :- :string
   raw-value-handler-ids :- [:set ms/PositiveInt]]
  (let [user-clause [:and
                     [:= :nr.type "notification-recipient/user"]
                     [:= [:lower :cu.email] lower-email]]]
    (or (t2/select-fn-set :notification_id (t2/table-name :model/NotificationHandler)
                          {:join      [[(t2/table-name :model/NotificationRecipient) :nr]
                                       [:= :nr.notification_handler_id :notification_handler.id]]
                           :left-join [[:core_user :cu] [:= :cu.id :nr.user_id]]
                           :where     (if (seq raw-value-handler-ids)
                                        [:or user-clause [:in :notification_handler.id raw-value-handler-ids]]
                                        user-clause)})
        #{})))

(mu/defn delete-notification-recipients-for-user!
  "Delete the NotificationRecipients for the User with `user-id` on the Notification with `notification-id`,
  returning the number deleted."
  [notification-id :- ms/PositiveInt
   user-id         :- ::lib.schema.id/user]
  (t2/delete! :model/NotificationRecipient
              :user_id user-id
              :notification_handler_id [:in ^:allow-subquery {:select [:id]
                                                              :from   [:notification_handler]
                                                              :where  [:= :notification_id notification-id]}]))

;;; --------------------------------------------- Task runs ----------------------------------------------

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
                        :from     [[:task_history :th]]
                        :join     [[:task_run :tr] [:= :tr.id :th.run_id]]
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

(mu/defn select-admin-notifications-page
  "A page (`limit`/`offset`) of admin notification-list rows matching `filters` (see
  [[metabase.notification.api.admin]] for the supported keys), most-relevant first per `:sort_column`/
  `:sort_direction`."
  [filters :- AdminFilters
   limit   :- ms/PositiveInt
   offset  :- ms/IntGreaterThanOrEqualToZero]
  (t2/select :model/Notification (assoc (admin-list-query filters) :limit limit :offset offset)))

(mu/defn count-admin-notifications
  "The number of admin notification-list rows matching `filters`."
  [filters :- AdminFilters]
  (:count (t2/query-one (-> (admin-list-query filters)
                            (assoc :select [[[:count :notification.id] :count]])
                            (dissoc :order-by)))))

(mu/defn select-admin-notification-detail-row
  "The admin notification-list row (skipping the run-summary joins) for the Notification with `notification-id`, or
  nil."
  [notification-id :- ms/PositiveInt]
  (t2/select-one :model/Notification
                 (-> (admin-base-list-query {:skip-run-joins? true})
                     (sql.helpers/where [:= :notification.id notification-id]))))

;;; ------------------------------------------- Other models -------------------------------------------

(mu/defn instance
  "The instance of `model` (a model keyword, or a `[model & columns]` vector) with `id`, or nil."
  [model :- [:or :keyword [:sequential :keyword]]
   id    :- [:maybe ms/PositiveInt]]
  (t2/select-one model id))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- [:maybe ::lib.schema.id/card]]
  (t2/select-one :model/Card card-id))

(mu/defn unarchived-card
  "The Card with `card-id` if it is not archived, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id :archived false))

(mu/defn card-name
  "The name of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :name :model/Card card-id))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard dashboard-id))

(mu/defn dashboard-name
  "The name of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :name :model/Dashboard dashboard-id))

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
  (t2/select-one-fn :email [:model/User :email] user-id))

(mu/defn user-summary
  "The ID, names, email, and derived common name of the User with `user-id`, or nil (also for a nil `user-id`, e.g.
  a system-created notification without a creator)."
  [user-id :- [:maybe ::lib.schema.id/user]]
  (t2/select-one [:model/User :id :first_name :last_name :email] user-id))

(mu/defn active-users-by-id
  "A map of ID to active User for `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-fn->fn :id identity :model/User :id [:in user-ids] :is_active true))
