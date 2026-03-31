(ns metabase.mq.init
  "Initializes the mq subsystem at startup."
  (:require
   [metabase.config.core :as config]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.settings :as mq.settings]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]))

(def ^:private valid-queue-backends
  #{:queue.backend/appdb :queue.backend/memory})

(def ^:private valid-topic-backends
  #{:topic.backend/appdb :topic.backend/memory})

(defmethod startup/def-startup-logic! ::MqInit [_]
  (binding [*out* *err*]
    (println "[TZ-DEBUG] MqInit running, is-test?=" config/is-test? "run-mode=" config/run-mode))
  (if config/is-test?
    ;; In tests, use the sync backend (inline processing, no background threads).
    ;; Tests that need MQ use `with-sync-mq`. Appdb-specific tests call backend methods directly.
    (do
      (alter-var-root #'q.backend/*backend* (constantly :queue.backend/sync))
      (alter-var-root #'topic.backend/*backend* (constantly :topic.backend/sync))
      ;; Disable publish buffering so messages are delivered immediately (no background flush thread in tests)
      (alter-var-root #'publish-buffer/*publish-buffer-ms* (constantly 0))
      (listener/register-listeners!))
    ;; In production, use configured backends with background polling.
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
      (listener/register-listeners!)
      (publish-buffer/start-publish-buffer-flush!)
      (mq.impl/start-worker-pool!)
      (mq.impl/start-transports))))
