(ns metabase.mq.queue.sync
  "Synchronous queue backend that calls the handler inline during `publish!`.
  Useful in tests to avoid needing `*force-sync*` dynamic vars in each namespace."
  (:require
   [metabase.mq.queue.backend :as q.backend]))

(set! *warn-on-reflection* true)

(defmethod q.backend/publish! :queue.backend/sync [_ queue-name messages]
  (let [batch-id (str (random-uuid))]
    (q.backend/handle! :queue.backend/sync queue-name batch-id messages)))

(defmethod q.backend/queue-length :queue.backend/sync [_ _queue-name]
  0)

(defmethod q.backend/listen! :queue.backend/sync [_ _queue-name]
  nil)

(defmethod q.backend/stop-listening! :queue.backend/sync [_ _queue-name]
  nil)

(defmethod q.backend/batch-successful! :queue.backend/sync [_ _queue-name _batch-id]
  nil)

(defmethod q.backend/batch-failed! :queue.backend/sync [_ _queue-name _batch-id]
  nil)

(defmethod q.backend/shutdown! :queue.backend/sync [_]
  nil)
