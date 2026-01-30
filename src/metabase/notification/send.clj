(ns metabase.notification.send
  (:require
   [java-time.api :as t]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.channel.core :as channel]
   [metabase.config.core :as config]
   [metabase.notification.models :as models.notification]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.settings :as notification.settings]
   [metabase.task-history.core :as task-history]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.retry :as retry]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent ArrayBlockingQueue Callable Executors ThreadPoolExecutor)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)
   (org.quartz CronExpression)))

(set! *warn-on-reflection* true)

(defn- handler->channel-name
  [{:keys [channel_type channel_id]}]
  (if channel_id
    (str (u/qualified-name channel_type) " " channel_id)
    (u/qualified-name channel_type)))

(def ^:private default-blocking-queue-size 1000)

(def ^:private default-shutdown-timeout-ms (* 30 60 1000)) ;; 30 minutes

(def ^:private default-retry-config
  {:max-attempts            (if config/is-dev? 2 7)
   :initial-interval-millis 500
   :multiplier              2.0
   :randomization-factor    0.1
   :max-interval-millis     30000
   :retry-on-exception-pred (comp not ::skip-retry? ex-data)})

(defn- unretriable-error?
  [error]
  (let [unretriable-errors #{:slack/invalid-token :slack/channel-not-found}]
    (contains? unretriable-errors error)))

(defn- should-skip-retry?
  [exception channel-type]
  (let [error (:error-type (ex-data exception))]
    (and (= :channel/slack channel-type)
         (unretriable-error? error))))

(defn- channel-send-retrying!
  [notification-id payload-type handler message]
  (let [channel      (or (:channel handler)
                         {:type (:channel_type handler)})
        channel-type (:type channel)]
    (try
      (let [#_notification-id #_(:notification_id handler)
            retry-config    default-retry-config
            retry-errors    (volatile! [])
            retry-report    (fn []
                              {:attempted_retries (count @retry-errors)
                               ;; we want the last retry to be the most recent
                               :retry_errors       (reverse @retry-errors)})
            send!           (fn []
                              (try
                                (channel/send! channel message)
                                (catch Exception e
                                  (let [skip-retry? (should-skip-retry? e (:type channel))
                                        new-e       (ex-info (ex-message e)
                                                             (assoc (ex-data e) ::skip-retry? skip-retry?)
                                                             e)]
                                    (if-not skip-retry?
                                      (do
                                        (vswap! retry-errors conj {:message   (u/strip-error e)
                                                                   :timestamp (t/offset-date-time)})
                                        (log/warn e "Failed to send,  retrying..."))
                                      (log/warn e "Failed to send, not retrying"))
                                    (throw new-e)))))
            retrier         (retry/make retry-config)]
        (log/debug "Started sending")
        (task-history/with-task-history {:task            "channel-send"
                                         :on-success-info (fn [update-map _result]
                                                            (cond-> update-map
                                                              (seq @retry-errors)
                                                              (update :task_details merge (retry-report))))
                                         :on-fail-info    (fn [update-map _result]
                                                            (update update-map :task_details merge (retry-report)))
                                         :task_details    {:retry_config      retry-config
                                                           :channel_id        (:id channel)
                                                           :channel_type      (:type channel)
                                                           :template_id       (:template_id handler)
                                                           :notification_id   notification-id
                                                           :notification_type payload-type
                                                           :recipient_ids     (map :id (:recipients handler))}}
          (retrier send!)
          (log/debugf "Sent with %d retries" (count @retry-errors))
          (log/info "Sent successfully")))
      (prometheus/inc! :metabase-notification/channel-send-ok {:payload-type payload-type
                                                               :channel-type channel-type})
      (catch Throwable e
        (prometheus/inc! :metabase-notification/channel-send-error {:payload-type payload-type
                                                                    :channel-type channel-type})
        (log/warn e "Failed to send")))))

(defn- hydrate-notification
  [notification-info]
  (case (:payload_type notification-info)
    (:notification/system-event :notification/testing :notification/card)
    (cond-> notification-info
      (t2/instance? notification-info)
      models.notification/hydrate-notification)
    ;; :notification/dashboard is still on pulse, so we expect it to self-contained. see [[metabase.pulse.send]]
    notification-info))

(defmulti do-after-notification-sent
  "Performs post-notification actions based on the notification type."
  {:arglists '([notification-info notification-payload skipped?])}
  (fn [notification-info _notification-payload _skipped?]
    (:payload_type notification-info)))

(defmethod do-after-notification-sent :default [_notification-info _notification-payload _skipped?] nil)

(def ^:private payload-labels         (for [payload-type (keys (methods notification.payload/payload))]
                                        {:payload-type payload-type}))
(def ^:private payload-channel-labels (for [[channel-type payload-type] (keys (methods channel/render-notification))]
                                        {:payload-type payload-type
                                         :channel-type channel-type}))

(defmethod prometheus/known-labels :metabase-notification/send-ok [_] payload-labels)
(defmethod prometheus/known-labels :metabase-notification/send-error [_] payload-labels)
(defmethod prometheus/known-labels :metabase-notification/channel-send-ok [_] payload-channel-labels)
(defmethod prometheus/known-labels :metabase-notification/channel-send-error [_] payload-channel-labels)

(defn- since-trigger-ms
  [notification-info]
  (some-> notification-info meta :notification/triggered-at-ns u/since-ms))

(mu/defn ^:private send-notification-sync!
  "Send the notification to all handlers synchronously. Do not use this directly, use *send-notification!* instead."
  [{:keys [id payload_type] :as notification-info} :- ::notification.payload/Notification]
  (log/with-context {:notification_id id
                     :payload_type    payload_type}
    (u/with-timer-ms
      [duration-ms-fn]
      (when-let [wait-time (since-trigger-ms notification-info)]
        (prometheus/observe! :metabase-notification/wait-duration-ms {:payload-type payload_type} wait-time))
      (try
        (log/info "Sending")
        (prometheus/inc! :metabase-notification/concurrent-tasks)
        (let [hydrated-notification (hydrate-notification notification-info)
              handlers              (:handlers hydrated-notification)]
          (task-history/with-task-history {:task          "notification-send"
                                           :task_details {:notification_id       id
                                                          :notification_handlers (map #(select-keys % [:id :channel_type :channel_id :template_id]) handlers)}}
            (let [notification-payload (notification.payload/notification-payload (dissoc hydrated-notification :handlers))
                  skip-reason          (notification.payload/skip-reason notification-payload)]
              (if skip-reason
                (log/info "Skipping" {:skip-reason skip-reason})
                (do
                  (log/debugf "Found %d handlers" (count handlers))
                  (doseq [handler handlers]
                    (log/with-context {:handler_id   (:id handler)
                                       :channel_type (:channel_type handler)}
                      (try
                        (let [channel-type (:channel_type handler)
                              messages     (channel/render-notification
                                            channel-type
                                            notification-payload
                                            handler)]
                          (log/debugf "Got %d messages for channel %s with template %d"
                                      (count messages)
                                      (handler->channel-name handler)
                                      (-> handler :template :id))
                          (doseq [message messages]
                            (channel-send-retrying! id payload_type handler message)))
                        (catch Exception e
                          (log/errorf e "Error sending to channel %s" (handler->channel-name handler))))))
                  (log/info "Done processing notification")))
              (do-after-notification-sent hydrated-notification notification-payload (some? skip-reason))
              (prometheus/inc! :metabase-notification/send-ok {:payload-type payload_type}))))
        (catch Exception e
          (log/error e "Failed to send")
          (prometheus/inc! :metabase-notification/send-error {:payload-type payload_type})
          (throw e))
        (finally
          (prometheus/dec! :metabase-notification/concurrent-tasks)))
      (prometheus/observe! :metabase-notification/send-duration-ms {:payload-type payload_type} (duration-ms-fn))
      (when-let [total-time (since-trigger-ms notification-info)]
        (prometheus/observe! :metabase-notification/total-duration-ms {:payload-type payload_type} total-time))
      nil)))

(defn- cron->next-execution-times
  "Returns the next n fired times for a given cron schedule.

  If the cron schedule doesn't have n future executions (e.g., one-off schedules),
  returns as many execution times as available."
  [cron-schedule n]
  (let [cron-expression (CronExpression. ^String cron-schedule)
        now             (t/java-date)]
    (loop [times     []
           next-time now
           remaining n]
      (if (zero? remaining)
        times
        (if-let [next-execution (.getNextValidTimeAfter cron-expression next-time)]
          (recur (conj times (t/instant next-execution))
                 next-execution
                 (dec remaining))
          ;; No more executions available
          times)))))

(defn- avg-interval-seconds
  "Returns the average seconds between executions for a given cron schedule by sampling future execution times.

  Using the average across multiple executions (rather than mean interval) helps handle
  irregular schedules (like workday-only alerts) consistently, ensuring that the priority doesn't
  fluctuate based on seasonality (e.g., different priority on Friday vs. Monday).

  For one-off schedules that don't repeat, returns 10 seconds to give them reasonable priority."
  [cron-schedule n]
  (assert (pos? n) "Need at least 1 execution time to calculate average")
  (let [times (cron->next-execution-times cron-schedule n)]
    (if (< (count times) 2)
      ;; Handle one-off schedules that don't repeat or have only one execution
      10
      (/ (t/as (t/duration (first times) (last times)) :seconds)
         (dec (count times))))))

(defn- subscription->deadline
  "Calculates a deadline for notification execution with priority based on frequency.

  More frequent notifications (based on cron schedule) receive shorter deadlines,
  which results in higher priority when multiple notifications are scheduled at
  the same time."
  [{:keys [type cron_schedule]}]
  (let [deadline-bonus (case type
                         :notification-subscription/cron
                         (let [avg-interval-seconds (avg-interval-seconds cron_schedule 10)
                               interval-less-than   (fn [duration] (< avg-interval-seconds (t/as duration :seconds)))]
                           (cond
                             (interval-less-than (t/minutes 1))  (t/seconds 5)
                             (interval-less-than (t/minutes 5))  (t/seconds 10)
                             (interval-less-than (t/minutes 30)) (t/seconds 15)
                             (interval-less-than (t/hours 1))    (t/seconds 30)
                             :else                               (t/seconds 60)))
                         ;; default to 30 seconds for non-cron subscriptions
                         (t/seconds 30))]
    (t/plus (t/local-date-time) deadline-bonus)))

;; A notification that can be put into a queue but has equal checks based on its ID
(deftype NotificationQueueEntry [id deadline]
  Object
  (equals [this  other]
    (and (instance? NotificationQueueEntry other)
         (= (.id this) (.id ^NotificationQueueEntry other))))

  (hashCode [this]
    (hash (.id this)))
  Comparable
  (compareTo [this other]
    (compare (.id this) (.id ^NotificationQueueEntry other))))

(defn- deadline-comparator
  "Comparator for sorting notifications by deadline."
  [a b]
  (compare (.deadline ^NotificationQueueEntry a) (.deadline ^NotificationQueueEntry b)))

(defprotocol NotificationQueueProtocol
  "Protocol for notification queue implementations."
  (put-notification!  [this notification] "Add a notification to the queue. If a notification with the same id is already in the queue, replace it.")
  (take-notification-with-timeout! [this timeout-ms] "Take the next notification from the queue, returning nil if timeout is reached.")
  (queue-size [this] "Get the current size of the queue."))

;; A priority queue that deduplicates notifications by id
(deftype ^:private DedupPriorityQueue
         [^java.util.PriorityQueue                  items-list
          ^java.util.concurrent.ConcurrentHashMap   id->notification
          ^java.util.concurrent.locks.ReentrantLock queue-lock
          ^java.util.concurrent.locks.Condition     not-empty-cond]
  NotificationQueueProtocol
  (put-notification! [_ notification]
    (let [id   (or (:id notification) (str (random-uuid)))
          item (NotificationQueueEntry. id (subscription->deadline (:triggering_subscription notification)))]
      (.lock queue-lock)
      (try
        (when-not (.containsKey id->notification id)
          (.offer items-list item))
        (.put id->notification id notification)
        ;; Signal that a notification is available
        (.signal not-empty-cond)
        (finally
          (.unlock queue-lock)))))

  (take-notification-with-timeout! [_ timeout-ms]
    (.lock queue-lock)
    (try
      ;; Wait until there's at least one notification or timeout
      (loop []
        (if (.isEmpty items-list)
          (if (.await not-empty-cond timeout-ms java.util.concurrent.TimeUnit/MILLISECONDS)
            (recur)
            nil) ; timeout occurred
          (let [^NotificationQueueEntry entry (.poll items-list)
                id                            (.id entry)]
            (.remove id->notification id))))
      (finally
        (.unlock queue-lock))))

  (queue-size [_]
    (.lock queue-lock)
    (try
      (.size items-list)
      (finally
        (.unlock queue-lock)))))

(defn- create-dedup-priority-queue
  "A thread-safe, prioritized notification queue with the following properties:
  - Notifications are identified by unique IDs
  - Prioritized by deadline
  - Adding a notification with an ID already in the queue replaces the existing one
  - Taking from an empty queue blocks until a notification is available
  - Multiple threads can safely add and take from the queue concurrently"
  []
  (let [queue-lock     (java.util.concurrent.locks.ReentrantLock.)
        not-empty-cond (.newCondition queue-lock)]
    (->DedupPriorityQueue (java.util.PriorityQueue. ^java.util.Comparator deadline-comparator)
                          (java.util.concurrent.ConcurrentHashMap.)
                          queue-lock
                          not-empty-cond)))

;; A simple array blocking queue for notification
(deftype BlockingQueue [^java.util.concurrent.ArrayBlockingQueue items-list]
  NotificationQueueProtocol
  (put-notification! [_ notification]
    (.put items-list notification))
  (take-notification-with-timeout! [_ timeout-ms]
    (.poll items-list timeout-ms java.util.concurrent.TimeUnit/MILLISECONDS))
  (queue-size [_]
    (.size items-list)))

(defn- create-blocking-queue
  "Create a blocking queue for notifications."
  []
  (BlockingQueue. (ArrayBlockingQueue. default-blocking-queue-size)))

(defn- create-notification-dispatcher
  "Create a thread pool for sending notifications.
  There can only be one notification with the same id in the queue.
  - if a notification of the same id is already in the queue, then replace it
  (we keep the latest version because it likely contains the most up-to-date information
  such as: creator_id, active status, handlers info etc.)
  - if a notification doesn't have id, put it into queue regardless (used to send unsaved notifications)

  Returns a map with :dispatch-fn and :shutdown-fn."
  [pool-size queue]
  (let [executor (Executors/newFixedThreadPool
                  pool-size
                  (.build
                   (doto (BasicThreadFactory$Builder.)
                     (.namingPattern "send-notification-thread-pool-%d"))))
        shutdown-flag (java.util.concurrent.atomic.AtomicBoolean. false)
        start-worker! (fn []
                        (.submit ^ThreadPoolExecutor executor
                                 ^Callable (fn []
                                             (while (and (not (Thread/interrupted))
                                                         (or (not (.get shutdown-flag))
                                                             ;; Continue processing if shutdown flag is set but queue is not empty
                                                             (pos? (queue-size queue))))
                                               (try
                                                 (when-let [notification (take-notification-with-timeout! queue 1000)]
                                                   (log/with-restored-context-from-meta notification
                                                     (send-notification-sync! notification)))
                                                 (catch InterruptedException _
                                                   (log/warn "Notification worker interrupted, shutting down")
                                                   (throw (InterruptedException.)))
                                                 (catch Throwable e
                                                   (log/error e "Error in notification worker")))))))
        ensure-enough-workers! (fn []
                                 (dotimes [i (- pool-size (.getActiveCount ^ThreadPoolExecutor executor))]
                                   (log/debugf "Not enough workers, starting a new one %d/%d"
                                               (+ (.getActiveCount ^ThreadPoolExecutor executor) i)
                                               pool-size)
                                   (start-worker!)))
        dispatch-fn (fn [notification]
                      (if-not (.get shutdown-flag)
                        (do
                          (ensure-enough-workers!)
                          (put-notification! queue (log/with-context-meta notification))
                          ::ok)
                        (do
                          (log/infof "Rejecting notification with id %d as the workers are being shutdown" (:id notification))
                          ::shutdown)))
        shutdown-fn (fn [timeout-ms]
                      (log/infof "Gracefully shutting down notification dispatcher with %d pending notifications to process" (queue-size queue))
                      (.set shutdown-flag true)
                      (.shutdown ^ThreadPoolExecutor executor)
                      (try
                        (.awaitTermination ^ThreadPoolExecutor executor timeout-ms java.util.concurrent.TimeUnit/MILLISECONDS)
                        (log/info "Notification worker shut down successfully")
                        (catch InterruptedException _
                          (log/warn "Interrupted while waiting for notification executor to terminate")
                          (.shutdownNow ^ThreadPoolExecutor executor))))]

    (log/infof "Starting notification thread pool with %d threads" pool-size)
    (dotimes [_ pool-size]
      (start-worker!))
    {:dispatch-fn dispatch-fn
     :shutdown-fn shutdown-fn}))

(defonce ^:private dedup-priority-dispatcher
  (delay (create-notification-dispatcher (notification.settings/notification-thread-pool-size) (create-dedup-priority-queue))))

(defonce ^:private simple-blocking-dispatcher
  (delay (create-notification-dispatcher (notification.settings/notification-system-event-thread-pool-size) (create-blocking-queue))))

(defn- dispatch!
  [notification]
  (let [{:keys [dispatch-fn]} (case (:payload_type notification)
                                :notification/system-event
                                @simple-blocking-dispatcher
                                 ;; notification/card, notification/dashboard
                                @dedup-priority-dispatcher)]
    (dispatch-fn notification)))

(mu/defn ^:private send-notification-async!
  "Send a notification asynchronously."
  [notification :- ::notification.payload/Notification]
  (dispatch! notification)
  nil)

(def ^:private Options
  [:map
   [:notification/sync? :boolean]])

(def ^:dynamic *default-options*
  "The default options for sending a notification."
  {:notification/sync? false})

(mu/defn send-notification!
  "The function to send a notification. Defaults to `notification.send/send-notification-async!`."
  [notification & {:keys [] :as options} :- [:maybe Options]]
  (log/with-context {:notification_id (:id notification)
                     :payload_type    (:payload_type notification)}
    (let [options      (merge *default-options* options)
          notification (with-meta notification {:notification/triggered-at-ns (u/start-timer)})]
      (log/debugf "Will be send %s" (if (:notification/sync? options) "synchronously" "asynchronously"))
      (if (:notification/sync? options)
        (send-notification-sync! notification)
        (send-notification-async! notification)))))

(defn shutdown!
  "Shutdown all notification workers with wait up to [[timeout-ms]] milliseconds for each workers."
  []
  (let [workers [dedup-priority-dispatcher simple-blocking-dispatcher]]
    (log/with-context {:dispatcher-count (count workers)}
      (log/info "Shutting down notification dispatchers...")
      (try
        (doseq [worker workers]
          ((:shutdown-fn @worker) default-shutdown-timeout-ms))
        (log/info "All notification workers shut down successfully")
        (catch Exception e
          (log/error e "Error shutting down notification workers"))))))
