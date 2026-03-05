(ns metabase.mq.init
  "Initializes the mq subsystem at startup."
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.settings :as mq.settings]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]))

(def ^:private valid-queue-backends
  #{:queue.backend/appdb :queue.backend/memory})

(def ^:private valid-topic-backends
  #{:topic.backend/appdb :topic.backend/memory})

(defmethod startup/def-startup-logic! ::MqInit [_]
  (let [queue-be (keyword "queue.backend" (mq.settings/queue-backend))
        topic-be (keyword "topic.backend" (mq.settings/topic-backend))]
    (when-not (contains? valid-queue-backends queue-be)
      (throw (ex-info (str "Invalid queue backend: " queue-be
                           ". Valid backends: " valid-queue-backends)
                      {:backend queue-be :valid valid-queue-backends})))
    (when-not (contains? valid-topic-backends topic-be)
      (throw (ex-info (str "Invalid topic backend: " topic-be
                           ". Valid backends: " valid-topic-backends)
                      {:backend topic-be :valid valid-topic-backends})))
    (alter-var-root #'q.backend/*backend* (constantly queue-be))
    (alter-var-root #'topic.backend/*backend* (constantly topic-be))
    (log/infof "Queue backend set to %s" queue-be)
    (log/infof "Topic backend set to %s" topic-be)
    (mq.impl/register-listeners!)
    (q.impl/start!)
    (topic.impl/start!)))
