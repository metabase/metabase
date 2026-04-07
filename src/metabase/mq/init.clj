(ns metabase.mq.init
  "Initializes the mq subsystem at startup."
  (:require
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

(defn start!
  "Initializes the MQ subsystem with the given backends. Returns a handle that must be
   passed to [[stop!]] to shut down and restore the previous backend state.

   Called by [[startup/def-startup-logic!]] with production backends (handle discarded;
   production shutdown uses [[startup/def-shutdown-logic!]] instead) and by
   `metabase.mq.test-util/with-sync-mq` with sync backends (handle captured locally).

   Backends are set globally via `alter-var-root`. For test isolation, bind
   `listener/*listeners*` and `publish-buffer/*publish-buffer*` with fresh atoms."
  [queue-be topic-be]
  (let [prev-queue-be q.backend/*backend*
        prev-topic-be topic.backend/*backend*]
    (alter-var-root #'q.backend/*backend* (constantly queue-be))
    (alter-var-root #'topic.backend/*backend* (constantly topic-be))
    (log/infof "Queue backend: %s, Topic backend: %s" queue-be topic-be)
    (listener/register-listeners!)
    (publish-buffer/start-publish-buffer-flush!)
    (mq.impl/start-worker-pool!)
    (mq.impl/start-transports)
    {:prev-queue-be prev-queue-be
     :prev-topic-be prev-topic-be
     :queue-be      queue-be
     :topic-be      topic-be}))

(defn stop!
  "Shuts down the MQ subsystem.

   Called with no arguments (production): shuts down all services using the current backend vars.

   Called with a handle (the map returned by [[start!]]): additionally restores the previous
   backend state. Used by `metabase.mq.test-util/with-sync-mq` for test isolation."
  ([]
   (publish-buffer/stop-publish-buffer-flush!)
   (q.backend/shutdown! q.backend/*backend*)
   (topic.backend/shutdown! topic.backend/*backend*)
   (mq.impl/shutdown-worker-pool!)
   (reset! listener/*listeners* {}))
  ([{:keys [prev-queue-be prev-topic-be queue-be topic-be]}]
   (publish-buffer/stop-publish-buffer-flush!)
   (q.backend/shutdown! queue-be)
   (topic.backend/shutdown! topic-be)
   (mq.impl/shutdown-worker-pool!)
   (reset! listener/*listeners* {})
   (alter-var-root #'q.backend/*backend* (constantly prev-queue-be))
   (alter-var-root #'topic.backend/*backend* (constantly prev-topic-be))))

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
    ;; Handle discarded — production shutdown goes through def-shutdown-logic! below.
    (start! queue-be topic-be)
    nil))

(defmethod startup/def-shutdown-logic! ::MqShutdown [_]
  (stop!))
