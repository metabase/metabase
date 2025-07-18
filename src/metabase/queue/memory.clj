(ns metabase.queue.memory
  (:require [metabase.queue.backend :as q.backend]
            [metabase.queue.listener :as q.listener]
            [metabase.util.log :as log]
            [metabase.util.queue :as u.queue]))

(def ^:private queues
  (atom {}))

(defmethod q.backend/define-queue!
  :queue.backend/memory [_ queue-name]
  (swap! queues assoc queue-name (u.queue/delay-queue)))

(defmethod q.backend/publish! :queue.backend/memory [_ queue-name payload]
  (when-let [q (get @queues queue-name)]
    (u.queue/put-with-delay! q 0 payload)))

(defmethod q.backend/queue-length :queue.backend/memory [_ queue-name]
  (if-let [q (get @queues queue-name)]
    (.size q)
    0))

(defmethod q.backend/listen! :queue.backend/memory [_ queue-name]
  (u.queue/listen!
   (name queue-name)
   (queue-name @queues)
   (fn [batches]
     (doseq [batch batches]
       (q.listener/handle! :id (str (random-uuid)) :queue queue-name :payload batch))) {})
  (log/infof "Registered memory handler for queue %s" (name queue-name))
  queue-name)

(defmethod q.backend/close-queue! :queue.backend/memory [_ queue-name]
  (when-let [q (get @queues queue-name)]
    (u.queue/stop-listening! (name queue-name))
    (swap! queues dissoc queue-name)
    (log/infof "Unregistered memory handler for queue %s" (name queue-name))))
