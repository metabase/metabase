(ns metabase.notification.send
  (:require
   [java-time.api :as t]
   [metabase.channel.core :as channel]
   [metabase.config :as config]
   [metabase.events :as events]
   [metabase.models.notification :as models.notification]
   [metabase.models.setting :as setting]
   [metabase.models.task-history :as task-history]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.retry :as retry]
   [toucan2.core :as t2])

  (:import
   (java.util.concurrent Callable Executors ExecutorService)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)))

(set! *warn-on-reflection* true)

(defn- handler->channel-name
  [{:keys [channel_type channel_id]}]
  (if channel_id
    (str (u/qualified-name channel_type) " " channel_id)
    (u/qualified-name channel_type)))

(setting/defsetting notification-thread-pool-size
  "The size of the thread pool used to send notifications."
  :default    2
  :export?    false
  :type       :integer
  :visibility :internal)

(defonce ^:private pool
  (delay (Executors/newFixedThreadPool
          (notification-thread-pool-size)
          (.build
           (doto (BasicThreadFactory$Builder.)
             (.namingPattern "send-notification-thread-pool-%d"))))))

(def ^:private default-retry-config
  {:max-attempts            (if config/is-dev? 2 7)
   :initial-interval-millis 500
   :multiplier              2.0
   :randomization-factor    0.1
   :max-interval-millis     30000})

(defn- should-retry-sending?
  [exception channel-type]
  (not (and (= :channel/slack channel-type)
            (contains? (:errors (ex-data exception)) :slack-token))))

(defn- channel-send-retrying!
  [notification-id payload-type handler message]
  (try
    (let [#_notification-id #_(:notification_id handler)
          retry-config    default-retry-config
          retry-errors    (volatile! [])
          retry-report    (fn []
                            {:attempted_retries (count @retry-errors)
                             ;; we want the last retry to be the most recent
                             :retry_errors       (reverse @retry-errors)})
          channel         (or (:channel handler)
                              {:type (:channel_type handler)})
          send!           (fn []
                            (try
                              (channel/send! channel message)
                              (catch Exception e
                                (when (should-retry-sending? e (:type channel))
                                  (vswap! retry-errors conj {:message   (u/strip-error e)
                                                             :timestamp (t/offset-date-time)})
                                  (log/warnf e "[Notification %d] Failed to send to channel %s , retrying..."
                                             notification-id (handler->channel-name handler))
                                  (throw e)))))
          retrier         (retry/make retry-config)]
      (log/debugf "[Notification %d] Sending a message to channel %s" notification-id (handler->channel-name handler))
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
        (log/debugf "[Notification %d] Sent to channel %s with %d retries"
                    notification-id (handler->channel-name handler) (count @retry-errors))))
    (catch Throwable e
      (log/errorf e "[Notification %d] Error sending notification!" notification-id))))

(defn- hydrate-notification
  [notification-info]
  (case (:payload_type notification-info)
    (:notification/system-event :notification/testing :notification/card)
    (cond-> notification-info
      (t2/instance? notification-info)
      models.notification/hydrate-notification)
    ;; :notification/dashboard is still on pulse, so we expect it to self-contained. see [[metabase.pulse.send]]
    notification-info))

;; TODO: should this be a multimethod?
(defn- do-after-notification-sent
  [{:keys [payload_type] :as notification-info}]
  (u/ignore-exceptions
    (when (and (= :notification/card payload_type)
               (-> notification-info :payload :send_once))
      (t2/delete! :model/Pulse (-> notification-info :payload :id)))
    ;; TODO check how this is used, maybe we need to rework this
    (when (#{:notification/card :notification/dashboard} payload_type)
      (let [event-type (if (= :notification/dashboard payload_type)
                         :event/subscription-send
                         :event/alert-send)]
        (events/publish-event! event-type {:id      (:id notification-info)
                                           :user-id (:creator_id notification-info)
                                           :object  {:recipients (->> notification-info :handlers (mapcat :recipients) (map #(or (:user %)
                                                                                                                                 (:email %))))
                                                     :filters    (when (= :notification/dashboard payload_type)
                                                                   (-> notification-info :dashboard_subscription :parameters))}})))))

(mu/defn send-notification-sync!
  "Send the notification to all handlers synchronously. Do not use this directly, use *send-notification!* instead."
  [{notification-id :id :as notification-info} :- ::notification.payload/Notification]
  (try
    (log/infof "[Notification %d] Sending" notification-id)
    (let [hydrated-notification (hydrate-notification notification-info)
          handlers              (:handlers hydrated-notification)]
      (task-history/with-task-history {:task          "notification-send"
                                       :task_details {:notification_id       notification-id
                                                      :notification_handlers (map #(select-keys % [:id :channel_type :channel_id :template_id]) handlers)}}
        (let [notification-payload (notification.payload/notification-payload (dissoc hydrated-notification :handlers))]
          (if (notification.payload/should-send-notification? notification-payload)
            (do
              (log/debugf "[Notification %d] Found %d handlers" notification-id (count handlers))
              (doseq [handler handlers]
                (try
                  (let [channel-type (:channel_type handler)
                        messages     (channel/render-notification
                                      channel-type
                                      notification-payload
                                      (:template handler)
                                      (:recipients handler))]
                    (log/debugf "[Notification %d] Got %d messages for channel %s with template %d"
                                notification-id (count messages)
                                (handler->channel-name handler)
                                (-> handler :template :id))
                    (doseq [message messages]
                      (log/infof "[Notification %d] Sending message to channel %s"
                                 notification-id (:channel_type handler))
                      (channel-send-retrying! notification-id (:payload_type hydrated-notification) handler message)))
                  (catch Exception e
                    (log/warnf e "[Notification %d] Error sending to channel %s"
                               notification-id (handler->channel-name handler)))))
              (do-after-notification-sent hydrated-notification)
              (log/infof "[Notification %d] Sent successfully" notification-id))
            (log/infof "[Notification %d] Skipping" notification-id)))))
    (catch Exception e
      (log/errorf e "[Notification %d] Failed to send" notification-id)
      (throw e)))
  nil)

(mu/defn send-notification-async!
  "Send a notification asynchronously."
  [notification :- ::notification.payload/Notification]
  (.submit ^ExecutorService @pool ^Callable
           (fn []
             (send-notification-sync! notification)))
  nil)
