(ns metabase.mq.queue.memory
  "In-memory implementation of the message queue."
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.settings :as mq.settings]
   [metabase.util.log :as log]
   [metabase.util.queue :as u.queue]))

(set! *warn-on-reflection* true)

(def ^:dynamic *queues*
  (atom {}))

(def ^:dynamic *batch-registry*
  "Maps batch-id → {:message ... :failures ...} for retry tracking."
  (atom {}))

(defn- get-queue [queue-name]
  (if-let [queue (get @*queues* queue-name)]
    queue
    (throw (ex-info "Queue not defined" {:queue queue-name}))))

(defmethod q.backend/publish! :queue.backend/memory [_ queue-name messages]
  (let [q (get-queue queue-name)]
    (doseq [message messages]
      (u.queue/put-with-delay! q 0 message))))

(defmethod q.backend/clear-queue! :queue.backend/memory [_ queue-name]
  (let [^java.util.Collection q (get-queue queue-name)]
    (.clear q))
  (reset! *batch-registry* {}))

(defmethod q.backend/queue-length :queue.backend/memory [_ queue-name]
  (if-let [^java.util.Collection q (get @*queues* queue-name)]
    (.size q)
    0))

(defmethod q.backend/listen! :queue.backend/memory [_ queue-name]
  (when-not (contains? @*queues* queue-name)
    (swap! *queues* assoc queue-name (u.queue/delay-queue)))
  (let [queue (get-queue queue-name)]
    (u.queue/listen!
     (name queue-name)
     queue
     (bound-fn [batches]
       (doseq [batch batches]
         (let [batch-id (str (random-uuid))]
           ;; Register the batch for retry tracking
           (swap! *batch-registry* assoc batch-id {:message batch :failures 0})
           ;; use *backend* in case being called from tracking backend wrapper
           (q.backend/handle! q.backend/*backend* queue-name batch-id [batch])))) {})
    (log/infof "Registered memory handler for queue %s" (name queue-name))))

(defmethod q.backend/stop-listening! :queue.backend/memory [_ queue-name]
  (u.queue/stop-listening! (name queue-name))
  (swap! *queues* dissoc queue-name)
  (log/infof "Unregistered memory handler for queue %s" (name queue-name)))

(defmethod q.backend/batch-successful! :queue.backend/memory [_ _queue-name batch-id]
  (swap! *batch-registry* dissoc batch-id))

(defmethod q.backend/batch-failed! :queue.backend/memory [_ queue-name batch-id]
  (when-let [{:keys [message failures]} (get @*batch-registry* batch-id)]
    (swap! *batch-registry* dissoc batch-id)
    (let [new-failures (inc failures)]
      (if (>= new-failures (mq.settings/queue-max-retries))
        (log/warnf "Batch %s has reached max failures (%d), dropping" batch-id (mq.settings/queue-max-retries))
        ;; Retry asynchronously with a new batch-id carrying the accumulated failure count.
        ;; We call handle! directly rather than re-queuing, so the failure count is preserved.
        (future
          (let [new-batch-id (str (random-uuid))]
            (swap! *batch-registry* assoc new-batch-id {:message message :failures new-failures})
            (q.backend/handle! q.backend/*backend* queue-name new-batch-id [message])))))))
