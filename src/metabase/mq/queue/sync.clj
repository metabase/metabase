(ns metabase.mq.queue.sync
  "Synchronous queue backend that calls the listener inline during `publish!`.
  Useful in tests to avoid needing `*force-sync*` dynamic vars in each namespace."
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]))

(set! *warn-on-reflection* true)

(def ^:dynamic *undelivered*
  "Atom tracking undelivered message counts per queue (for queues with no listener)."
  (atom {}))

(defmethod q.backend/publish! :queue.backend/sync [_ queue-name messages]
  (let [bundle-id (str (random-uuid))]
    (if (get @q.impl/*listeners* queue-name)
      ;; Call handle! directly to bypass accumulation — the sync backend must
      ;; deliver immediately so that tests observe side-effects inline.
      (q.impl/handle! queue-name {bundle-id :queue.backend/sync} messages)
      ;; No listener registered — track as undelivered bundle
      (swap! *undelivered* update queue-name (fnil inc 0)))))

(defmethod q.backend/queue-length :queue.backend/sync [_ queue-name]
  (get @*undelivered* queue-name 0))

(defmethod q.backend/bundle-successful! :queue.backend/sync [_ _queue-name _bundle-id]
  nil)

(defmethod q.backend/bundle-failed! :queue.backend/sync [_ _queue-name _bundle-id]
  nil)

(defmethod q.backend/shutdown! :queue.backend/sync [_]
  nil)
