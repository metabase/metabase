(ns metabase.mq.queue.sync
  "Synchronous queue backend that calls the listener inline during `publish!`.
  Useful in tests to avoid needing `*force-sync*` dynamic vars in each namespace."
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defmethod q.backend/publish! :queue.backend/sync [_ queue-name messages]
  (let [batch-id (str (random-uuid))]
    (if (listener/get-listener queue-name)
      ;; Call handle! directly to bypass accumulation — the sync backend must
      ;; deliver immediately so that tests observe side-effects inline.
      (mq.impl/handle! queue-name {batch-id :queue.backend/sync} messages)
      (log/warnf "No listener registered for queue %s, dropping %d message(s)" queue-name (count messages)))))

(defmethod q.backend/batch-successful! :queue.backend/sync [_ _queue-name _batch-id]
  nil)

(defmethod q.backend/batch-failed! :queue.backend/sync [_ _queue-name _batch-id]
  nil)

(defmethod q.backend/shutdown! :queue.backend/sync [_]
  nil)
