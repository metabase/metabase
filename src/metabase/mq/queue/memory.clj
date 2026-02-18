(ns metabase.mq.queue.memory
  "In-memory implementation of the message queue for testing purposes."
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.listener :as q.listener]
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

(defmethod q.backend/define-queue!
  :mq.queue.backend/memory [_ queue-name]
  (when-not (contains? @*queues* queue-name)
    (swap! *queues* assoc queue-name (u.queue/delay-queue))))

(defn- get-queue [queue-name]
  (if-let [queue (get @*queues* queue-name)]
    queue
    (throw (ex-info "Queue not defined" {:queue queue-name}))))

(defmethod q.backend/publish! :mq.queue.backend/memory [_ queue-name messages]
  (let [q (get-queue queue-name)]
    (doseq [message messages]
      (u.queue/put-with-delay! q 0 message))))

(defmethod q.backend/clear-queue! :mq.queue.backend/memory [_ queue-name]
  (let [^java.util.Collection q (get-queue queue-name)]
    (.clear q)))

(defmethod q.backend/queue-length :mq.queue.backend/memory [_ queue-name]
  (let [^java.util.Collection q (get-queue queue-name)]
    (.size q)))

(defmethod q.backend/listen! :mq.queue.backend/memory [_ queue-name]
  (let [queue (get-queue queue-name)]
    (u.queue/listen!
     (name queue-name)
     queue
     (bound-fn [batches]
       (doseq [batch batches]
         (q.listener/handle! {:id (str (random-uuid)) :queue queue-name :payload batch}))) {})
    (log/infof "Registered memory handler for queue %s" (name queue-name))))

(defmethod q.backend/close-queue! :mq.queue.backend/memory [_ queue-name]
  (u.queue/stop-listening! (name queue-name))
  (swap! *queues* dissoc queue-name)
  (track! :close-queue-callbacks queue-name)
  (log/infof "Unregistered memory handler for queue %s" (name queue-name)))

(defmethod q.backend/message-successful! :mq.queue.backend/memory [_ _queue-name message-id]
  (track! :successful-callbacks message-id))

(defmethod q.backend/message-failed! :mq.queue.backend/memory [_ _queue-name message-id]
  (track! :failed-callbacks message-id))
