(ns metabase.notification.core
  (:require
   [metabase.channel.core :as channel]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent Callable Executors ExecutorService)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)))

(defonce pool
  (Executors/newFixedThreadPool
   10
   (.build
    (doto (BasicThreadFactory$Builder.)
      (.namingPattern "send-notification-thread-pool-%d")))))

(defn- send-notification!
  [notification context]
  (let [noti-dests (t2/hydrate (t2/select :model/NotificationDestination :notification_id (:id notification))
                               :channel
                               :recipients
                               :template)]
    (doseq [dest noti-dests]
      (let [channel-type (:channel_type dest)
            messages     (channel/render-notification
                          channel-type
                          (assoc notification :payload context
                                 ;; TODO: template should be a separate arg
                                 :template (:template dest))
                          (:recipients dest))]
        (doseq [message messages]
          (channel/send! (or (:channel dest)
                             {:type channel-type}) message))))))

(defn send-notification-async!
  [notification context]
  (let [task (bound-fn []
               (send-notification! notification context))]
    (.submit ^ExecutorService pool ^Callable task))
  nil)
