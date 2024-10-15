(ns metabase.notification.core
  (:require
   [java-time.api :as t]
   [metabase.channel.core :as channel]
   [metabase.models.notification :as models.notification]
   [metabase.models.setting :as setting]
   [metabase.models.task-history :as task-history]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.retry :as retry]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent Callable Executors ExecutorService)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)))

(set! *warn-on-reflection* true)

(def ^:private Notification
  [:map {:closed true}
   [:payload_type (into [:enum] models.notification/notification-types)]
   [:id           {:optional true} ms/PositiveInt]
   [:active       {:optional true} :boolean]
   [:created_at   {:optional true} :any]
   [:updated_at   {:optional true} :any]])

(def NotificationInfo
  "Schema for the notificaiton info."
  [:multi {:dispatch :payload_type}
   [:notification/system-event [:merge
                                Notification
                                [:map {:closed true}
                                 [:payload
                                  [:map {:closed true}
                                   ;; TODO: event-info schema for each event type
                                   [:event-topic [:fn #(= "event" (-> % keyword namespace))]]
                                   [:event-info  [:maybe :map]]
                                   [:context     :map]]]]]]
   ;; for testing only
   [:notification/testing       :map]])

(defn- hydrate-notification-handler
  [notification-handlers]
  (t2/hydrate notification-handlers
              :channel
              :template
              :recipients))

(setting/defsetting notification-thread-pool-size
  "The size of the thread pool used to send notifications."
  :default 10
  :export? false
  :type :integer
  :visibility :internal)

(defonce ^:private pool
  (delay (Executors/newFixedThreadPool
          (notification-thread-pool-size)
          (.build
           (doto (BasicThreadFactory$Builder.)
             (.namingPattern "send-notification-thread-pool-%d"))))))

(def ^:private default-retry-config
  {:max-attempts            7
   :initial-interval-millis 500
   :multiplier              2.0
   :randomization-factor    0.1
   :max-interval-millis     30000})

(defn- handler->channel-name
  [{:keys [channel_type channel_id]}]
  (if channel_id
    (str (u/qualified-name channel_type) " " channel_id)
    (u/qualified-name channel_type)))

(defn- channel-send-retrying!
  [handler message]
  (try
    (let [notification-id (:notification_id handler)
          retry-config default-retry-config
          retry-errors (volatile! [])
          retry-report (fn []
                         {:attempted_retries (count @retry-errors)
                          ;; we want the last retry to be the most recent
                          :retry_errors       (reverse @retry-errors)})
          channel     (or (:channel handler)
                          {:type (:channel_type handler)})
          send!        (fn []
                         (try
                           (channel/send! channel message)
                           (catch Exception e
                             (vswap! retry-errors conj {:message   (u/strip-error e)
                                                        :timestamp (t/offset-date-time)})
                             (log/warnf e "[Notification %d] Failed to send to channel %s , retrying..." notification-id (handler->channel-name handler))
                             (throw e))))
          retrier     (retry/make retry-config)]
      (log/debugf "[Notification %d] Sending a message to channel %s" notification-id (handler->channel-name handler))
      (task-history/with-task-history {:task            "channel-send"
                                       :on-success-info (fn [update-map _result]
                                                          (cond-> update-map
                                                            (seq @retry-errors)
                                                            (update :task_details merge (retry-report))))
                                       :on-fail-info    (fn [update-map _result]
                                                          (update update-map :task_details merge (retry-report)))
                                       :task_details    {:retry_config    retry-config
                                                         :channel_id      (:id channel)
                                                         :channel_type    (:type channel)
                                                         :template_id     (:template_id handler)
                                                         :notification_id notification-id
                                                         :recipient_ids   (map :id (:recipients handler))}}
        (retrier send!)
        (log/debugf "[Notification %d] Sent to channel %s with %d retries" notification-id (handler->channel-name handler) (count @retry-errors))))
    (catch Throwable e
      (log/errorf e "[Notification %d] Error sending notification!" (:notification_id handler)))))

(mu/defn- send-notification-sync!
  "Send the notification to all handlers synchronously. Do not use this directly, use *send-notification!* instead."
  [notification-info :- NotificationInfo]
  (try
    (let [noti-handlers (hydrate-notification-handler (t2/select :model/NotificationHandler :notification_id (:id notification-info)))]
      (log/debugf "[Notification %d] Found %d handlers" (:id notification-info) (count noti-handlers))
      (task-history/with-task-history
       {:task          "notification-send"
        :task_details {:notification_id       (:id notification-info)
                       :notification_handlers (map #(select-keys % [:id :channel_type :channel_id :template_id]) noti-handlers)}}
        (doseq [handler noti-handlers]
          (let [channel-type (:channel_type handler)
                messages     (channel/render-notification
                              channel-type
                              notification-info
                              (:template handler)
                              (:recipients handler))]
            (log/debugf "[Notification %d] Got %d messages for channel %s with template %d"
                        (:id notification-info) (count messages)
                        (handler->channel-name handler)
                        (-> handler :template :id))
            (doseq [message messages]
              (log/infof "[Notification %d] Sending message to channel %s"
                         (:id notification-info) (:channel_type handler))
              (channel-send-retrying! handler message))))
        (log/infof "[Notification %d] Sent successfully" (:id notification-info))))
    (catch Exception e
      (log/errorf e "[Notification %d] Failed to send" (:id notification-info))
      (throw e)))
  nil)

(defn- send-notification-async!
  "Send a notification asynchronously."
  [notification]
  (.submit ^ExecutorService @pool ^Callable
           (fn []
             (send-notification-sync! notification)))
  nil)

(def ^:dynamic *send-notification!*
  "The function to send a notification. Defaults to `send-notification-async!`."
  send-notification-async!)
