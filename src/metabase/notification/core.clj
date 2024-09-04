(ns metabase.notification.core
  (:require
   [metabase.channel.core :as channel]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent Callable Executors ExecutorService)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)))

(defonce pool
  (Executors/newFixedThreadPool
   10 ;; TODO: this should be configurable
   (.build
    (doto (BasicThreadFactory$Builder.)
      (.namingPattern "send-notification-thread-pool-%d")))))

(defn send-notification!*
  [notification context]
  (let [noti-dests (t2/hydrate (t2/select :model/NotificationDestination :notification_id (:id notification))
                               :channel
                               :recipients
                               :channel_template)]
    (log/infof "[Notification %d] Found %d destinations" (:id notification) (count noti-dests))
    (doseq [dest noti-dests]
      (let [channel-type (:channel_type dest)
            messages     (channel/render-notification
                          channel-type
                          (assoc notification :payload context
                                 ;; TODO: channel_template should be a separate arg
                                 :channel_template (:channel_template dest))
                          (:recipients dest))]
        (log/infof "[Notification %d] Got %d messages for channel %s" (:id notification) (count messages) (:channel_type dest))
        (doseq [message messages]
          (channel/send! (or (:channel dest)
                             {:type channel-type}) message))))))

(defn send-notification-async!
  "Send a notification asynchronously."
  [notification context]
  (let [task (bound-fn []
               (send-notification!* notification context))]
    (.submit ^ExecutorService pool ^Callable task))
  nil)

(def ^:dynamic *send-notification!*
  "The function to use to send notifications. Defaults to `send-notification!`."
  send-notification!*)
