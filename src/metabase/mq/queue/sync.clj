(ns metabase.mq.queue.sync
  "Synchronous queue backend that calls the handler inline during `publish!`.
  Useful in tests to avoid needing `*force-sync*` dynamic vars in each namespace."
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]))

(set! *warn-on-reflection* true)

(defmethod q.backend/publish! :queue.backend/sync [_ queue-name messages]
  (let [bundle-id (str (random-uuid))]
    (q.impl/deliver-bundle! :queue.backend/sync queue-name bundle-id messages)
    (q.impl/flush-pending! queue-name)))

(defmethod q.backend/queue-length :queue.backend/sync [_ _queue-name]
  0)

(defmethod q.backend/listen! :queue.backend/sync [_ _queue-name]
  nil)

(defmethod q.backend/stop-listening! :queue.backend/sync [_ _queue-name]
  nil)

(defmethod q.backend/bundle-successful! :queue.backend/sync [_ _queue-name _bundle-id]
  nil)

(defmethod q.backend/bundle-failed! :queue.backend/sync [_ _queue-name _bundle-id]
  nil)

(defmethod q.backend/shutdown! :queue.backend/sync [_]
  nil)
