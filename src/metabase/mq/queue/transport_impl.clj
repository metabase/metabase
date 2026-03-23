(ns metabase.mq.queue.transport-impl
  "Queue implementations of the transport multimethods."
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.transport :as transport]))

(set! *warn-on-reflection* true)

(def keep-me
  "Referenced from [[metabase.mq.core]] to ensure this namespace is loaded."
  true)

(defmethod transport/on-listen! :queue [_ opts]
  {:exclusive (boolean (:exclusive opts))})

(defmethod transport/publish! :queue [channel messages]
  (q.backend/publish! q.backend/*backend* channel messages))

(defmethod transport/wrap-listener :queue [_channel listener]
  listener)
