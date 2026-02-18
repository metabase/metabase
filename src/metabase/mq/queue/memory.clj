(ns metabase.mq.queue.memory
  "In-memory implementation of the message queue for testing purposes."
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.util.log :as log]
   [metabase.util.queue :as u.queue]))

(set! *warn-on-reflection* true)

(def ^:dynamic *queues*
  (atom {}))

(def ^:dynamic *recent*
  "Tracks recent callback invocations for testing purposes."
  {:successful-callbacks  (atom [])
   :failed-callbacks      (atom [])
   :close-queue-callbacks (atom [])})

(defn- track! [recent-atom item]
  (swap! (recent-atom *recent*) (fn [items]
                                  (let [max-size  10
                                        new-items (conj items item)]
                                    (if (> (count new-items) max-size)
                                      (subvec new-items (- (count new-items) max-size))
                                      new-items)))))

(defn reset-tracking!
  "Resets all tracking atoms to empty vectors. For testing purposes."
  []
  (reset! (:successful-callbacks *recent*) [])
  (reset! (:failed-callbacks *recent*) [])
  (reset! (:close-queue-callbacks *recent*) []))

(defn recent-callbacks
  "Returns the recent callbacks map for test assertions."
  []
  *recent*)

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
    (.clear q)))

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
         (q.backend/handle! :queue.backend/memory queue-name (str (random-uuid)) [batch]))) {})
    (log/infof "Registered memory handler for queue %s" (name queue-name))))

(defmethod q.backend/stop-listening! :queue.backend/memory [_ queue-name]
  (u.queue/stop-listening! (name queue-name))
  (swap! *queues* dissoc queue-name)
  (track! :close-queue-callbacks queue-name)
  (log/infof "Unregistered memory handler for queue %s" (name queue-name)))

(defmethod q.backend/batch-successful! :queue.backend/memory [_ _queue-name batch-id]
  (track! :successful-callbacks batch-id))

(defmethod q.backend/batch-failed! :queue.backend/memory [_ _queue-name batch-id]
  (track! :failed-callbacks batch-id))
