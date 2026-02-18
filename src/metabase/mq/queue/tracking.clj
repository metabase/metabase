(ns metabase.mq.queue.tracking
  "Test backend for the message queue. Delegates to the in-memory backend
  while tracking callback invocations for test assertions."
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory]))

(set! *warn-on-reflection* true)

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
  "Resets all tracking atoms to empty vectors."
  []
  (reset! (:successful-callbacks *recent*) [])
  (reset! (:failed-callbacks *recent*) [])
  (reset! (:close-queue-callbacks *recent*) []))

(defn recent-callbacks
  "Returns the recent callbacks map for test assertions."
  []
  *recent*)

(defmethod q.backend/publish! :queue.backend/tracking [_ queue-name messages]
  (q.backend/publish! :queue.backend/memory queue-name messages))

(defmethod q.backend/clear-queue! :queue.backend/tracking [_ queue-name]
  (q.backend/clear-queue! :queue.backend/memory queue-name))

(defmethod q.backend/queue-length :queue.backend/tracking [_ queue-name]
  (q.backend/queue-length :queue.backend/memory queue-name))

(defmethod q.backend/listen! :queue.backend/tracking [_ queue-name]
  (q.backend/listen! :queue.backend/memory queue-name))

(defmethod q.backend/stop-listening! :queue.backend/tracking [_ queue-name]
  (q.backend/stop-listening! :queue.backend/memory queue-name)
  (track! :close-queue-callbacks queue-name))

(defmethod q.backend/batch-successful! :queue.backend/tracking [_ queue-name batch-id]
  (q.backend/batch-successful! :queue.backend/memory queue-name batch-id)
  (track! :successful-callbacks batch-id))

(defmethod q.backend/batch-failed! :queue.backend/tracking [_ queue-name batch-id]
  (q.backend/batch-failed! :queue.backend/memory queue-name batch-id)
  (track! :failed-callbacks batch-id))
