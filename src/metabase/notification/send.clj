(ns metabase.notification.send
  (:require
   [java-time.api :as t]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.channel.core :as channel]
   [metabase.config :as config]
   [metabase.models.setting :as setting]
   [metabase.models.task-history :as task-history]
   [metabase.notification.models :as models.notification]
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
  :default    3
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
      (prometheus/inc! :metabase-notification/channel-send-ok {:payload-type payload-type
                                                               :channel-type channel-type})
      (catch Throwable e
        (prometheus/inc! :metabase-notification/channel-send-error {:payload-type payload-type
                                                                    :channel-type channel-type})
        (log/errorf e "[Notification %d] Error sending notification!" notification-id)))))

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
  {:arglists '([notification-info notification-payload])}
  (fn [notification-info _notification-payload]
    (:payload_type notification-info)))

(defmethod do-after-notification-sent :default [_notification-info _notification-payload] nil)

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

(mu/defn send-notification-sync!
  "Send the notification to all handlers synchronously. Do not use this directly, use *send-notification!* instead."
  [{:keys [id payload_type] :as notification-info} :- ::notification.payload/Notification]
  (u/with-timer-ms
    [duration-ms-fn]
    (when-let [wait-time (since-trigger-ms notification-info)]
      (prometheus/observe! :metabase-notification/wait-duration-ms {:payload-type payload_type} wait-time))
    (try
      (log/infof "[Notification %d] Sending" id)
      (prometheus/inc! :metabase-notification/concurrent-tasks)
      (let [hydrated-notification (hydrate-notification notification-info)
            handlers              (:handlers hydrated-notification)]
        (task-history/with-task-history {:task          "notification-send"
                                         :task_details {:notification_id       id
                                                        :notification_handlers (map #(select-keys % [:id :channel_type :channel_id :template_id]) handlers)}}
          (let [notification-payload (notification.payload/notification-payload (dissoc hydrated-notification :handlers))]
            (if (notification.payload/should-send-notification? notification-payload)
              (do
                (log/debugf "[Notification %d] Found %d handlers" id (count handlers))
                (doseq [handler handlers]
                  (try
                    (let [channel-type (:channel_type handler)
                          messages     (channel/render-notification
                                        channel-type
                                        notification-payload
                                        (:template handler)
                                        (:recipients handler))]
                      (log/debugf "[Notification %d] Got %d messages for channel %s with template %d"
                                  id (count messages)
                                  (handler->channel-name handler)
                                  (-> handler :template :id))
                      (doseq [message messages]
                        (log/infof "[Notification %d] Sending message to channel %s"
                                   id (:channel_type handler))
                        (channel-send-retrying! id payload_type handler message)))
                    (catch Exception e
                      (log/warnf e "[Notification %d] Error sending to channel %s"
                                 id (handler->channel-name handler))))))
              (log/infof "[Notification %d] Skipping" id))
            (do-after-notification-sent notification-info notification-payload)
            (log/infof "[Notification %d] Sent successfully" id)
            (prometheus/inc! :metabase-notification/send-ok {:payload-type payload_type}))))
      (catch Exception e
        (log/errorf e "[Notification %d] Failed to send" id)
        (prometheus/inc! :metabase-notification/send-error {:payload-type payload_type})
        (throw e))
      (finally
        (prometheus/dec! :metabase-notification/concurrent-tasks)))
    (prometheus/observe! :metabase-notification/send-duration-ms {:payload-type payload_type} (duration-ms-fn))
    (when-let [total-time (since-trigger-ms notification-info)]
      (prometheus/observe! :metabase-notification/total-duration-ms {:payload-type payload_type} total-time))
    nil))

(mu/defn send-notification-async!
  "Send a notification asynchronously."
  [notification :- ::notification.payload/Notification]
  (.submit ^ExecutorService @pool ^Callable
           (fn []
             (send-notification-sync! notification)))
  nil)
