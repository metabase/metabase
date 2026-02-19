(ns metabase.mq.init
  "Loads mq namespaces for side effects on startup."
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.settings :as mq.settings]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]))

(defn init!
  "Reads the queue-backend and topic-backend settings and sets the corresponding dynamic vars."
  []
  (let [queue-be (keyword "queue.backend" (mq.settings/queue-backend))
        topic-be (keyword "topic.backend" (mq.settings/topic-backend))]
    (alter-var-root #'q.backend/*backend* (constantly queue-be))
    (alter-var-root #'topic.backend/*backend* (constantly topic-be))
    (log/infof "Queue backend set to %s" queue-be)
    (log/infof "Topic backend set to %s" topic-be)))

(defmethod startup/def-startup-logic! ::MqInit
  [_]
  (init!))
