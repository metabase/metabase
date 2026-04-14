(ns metabase.mq.queue.sync
  "Synchronous queue backend that calls the listener inline during `publish!`.
  Useful in tests to avoid needing `*force-sync*` dynamic vars in each namespace."
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defrecord SyncQueueBackend []
  q.backend/QueueBackend
  (publish! [this queue-name messages]
    (let [batch-id (str (random-uuid))]
      (if (listener/get-listener queue-name)
        ;; Call handle! directly to bypass accumulation — the sync backend must
        ;; deliver immediately so that tests observe side-effects inline.
        (mq.impl/handle! queue-name {batch-id this} messages)
        (log/warnf "No listener registered for queue %s, dropping %d message(s)" queue-name (count messages)))))
  (batch-successful! [_this _queue-name _batch-id] nil)
  (batch-failed!     [_this _queue-name _batch-id] nil)
  (start!            [_this] nil)
  (shutdown!         [_this] nil))

(def backend
  "Singleton instance of the sync queue backend."
  (->SyncQueueBackend))
