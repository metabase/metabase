(ns metabase.queue.memory
  (:require [metabase.queue.backend :as q.backend]
            [metabase.util.log :as log]
            [metabase.util.queue :as u.queue]))

(def ^:private queues
  (atom {}))

(defmethod q.backend/publish! :queue.backend/memory [_ queue-name messages]
  (when-let [q (get @queues queue-name)]
    (u.queue/put-with-delay! q 0 messages)))

(defmethod q.backend/queue-length :queue.backend/memory [_ queue-name]
  (if-let [q (get @queues queue-name)]
    (.size q)
    0))

(defmethod q.backend/listen! :queue.backend/memory [_ queue-name batch-handler]
  (when-not (contains? @queues queue-name)
    (let [queue (u.queue/delay-queue)]
      (swap! queues assoc queue-name queue)
      (u.queue/listen! (name queue-name) queue (fn [batches] (doseq [batch batches] (batch-handler batch {}))) {})
      (log/infof "Registered memory handler for queue %s" (name queue-name))
      queue-name)))

(defmethod q.backend/close-queue! :queue.backend/memory [_ queue-name]
  (when-let [q (get @queues queue-name)]
    (u.queue/stop-listening! (name queue-name))
    (swap! queues dissoc queue-name)
    (log/infof "Unregistered memory handler for queue %s" (name queue-name))))
