(ns metabase.queue.memory
  (:require [metabase.queue.backend :as q.backend]
            [metabase.queue.listener :as q.listener]
            [metabase.util.log :as log]
            [metabase.util.queue :as u.queue]))

(def ^:private queues
  (atom {}))

(def recent {:successful-callbacks (atom [])
             :failed-callbacks     (atom [])
             :close-queue-callbacks       (atom [])})

(defn- track! [recent-atom item]
  (swap! (recent-atom recent) (fn [items]
                                (let [max-size 10
                                      new-items (conj items item)]
                                  (if (> (count new-items) max-size)
                                    (subvec new-items (- (count new-items) max-size))
                                    new-items)))))

(defn reset-tracking! []
  (reset! (:successful-callbacks recent) [])
  (reset! (:failed-callbacks recent) [])
  (reset! (:close-queue-callbacks recent) []))

(defmethod q.backend/define-queue!
  :queue.backend/memory [_ queue-name]
  (swap! queues assoc queue-name (u.queue/delay-queue)))

(defn- get-queue [queue-name]
  (if-let [queue (get @queues queue-name)]
    queue
    (throw (ex-info "Queue not defined" {:queue queue-name}))))

(defmethod q.backend/publish! :queue.backend/memory [_ queue-name payload]
  (let [q (get-queue queue-name)]
    (u.queue/put-with-delay! q 0 payload)))

(defmethod q.backend/queue-length :queue.backend/memory [_ queue-name]
  (let [q (get-queue queue-name)]
    (.size q)))

(defmethod q.backend/listen! :queue.backend/memory [_ queue-name]
  (let [queue (get-queue queue-name)]
    (u.queue/listen!
     (name queue-name)
     queue
     (fn [batches]
       (doseq [batch batches]
         (q.listener/handle! :id (str (random-uuid)) :queue queue-name :payload batch))) {})
    (log/infof "Registered memory handler for queue %s" (name queue-name))
    queue-name))

(defmethod q.backend/close-queue! :queue.backend/memory [_ queue-name]
  (let [q (get-queue queue-name)]
    (u.queue/stop-listening! (name queue-name))
    (swap! queues dissoc queue-name)
    (track! :close-queue-callbacks queue-name)
    (log/infof "Unregistered memory handler for queue %s" (name queue-name))))

(defmethod q.backend/message-successful! :queue.backend/memory [_ queue-name message-id]
  (track! :successful-callbacks message-id))

(defmethod q.backend/message-failed! :queue.backend/memory [_ queue-name message-id]
  (track! :failed-callbacks message-id))
