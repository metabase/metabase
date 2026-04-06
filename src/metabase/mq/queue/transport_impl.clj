(ns metabase.mq.queue.transport-impl
  "Queue implementations of the transport multimethods."
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.transport :as transport]))

(set! *warn-on-reflection* true)

(defmethod transport/on-listen! :queue [_ opts]
  {:exclusive (boolean (:exclusive opts))})

(defmethod transport/publish! :queue [channel messages]
  (q.backend/publish! q.backend/*backend* channel messages))

(defmethod transport/wrap-listener :queue [_channel listener]
  listener)

(defmethod transport/start! :queue [_]
  (q.backend/start! q.backend/*backend*))

(defmethod transport/shutdown! :queue [_]
  (q.backend/shutdown! q.backend/*backend*))
