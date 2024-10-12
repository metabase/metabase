(ns metabase.notification.core
  (:require
   [metabase.channel.core :as channel]
   [metabase.models.notification :as models.notification]
   [metabase.models.setting :as setting]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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
                                   [:event-info [:maybe :map]]
                                   [:settings   :map]]]]]]])

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

(mu/defn- send-notification-sync!
  "Send the notification to all handlers synchronously. Do not use this directly, use *send-notification!* instead."
  [notification-info :- NotificationInfo]
  (let [noti-handlers (hydrate-notification-handler (t2/select :model/NotificationHandler :notification_id (:id notification-info)))]
    (log/infof "[Notification %d] Found %d handlers" (:id notification-info) (count noti-handlers))
    (doseq [handler noti-handlers]
      (let [channel-type (:channel_type handler)
            messages     (channel/render-notification
                          channel-type
                          notification-info
                          (:template handler)
                          (:recipients handler))]
        (log/infof "[Notification %d] Got %d messages for channel %s" (:id notification-info) (count messages) (:channel_type handler))
        (doseq [message messages]
          (channel/send! (or (:channel handler)
                             {:type channel-type}) message)))))
  nil)

(defn- send-notification-async!
  "Send a notification asynchronously."
  [notification]
  (let [task (bound-fn []
               (send-notification-sync! notification))]
    (.submit ^ExecutorService @pool ^Callable task))
  nil)

(def ^:dynamic *send-notification!*
  "The function to send a notification. Defaults to `send-notification-async!`."
  send-notification-async!)
