(ns metabase.mq.queue.transport-impl
  "Queue implementations of the transport-level multimethods in
  `metabase.mq.transport`."
  (:require
   [metabase.mq.transport :as transport]))

(set! *warn-on-reflection* true)

(defmethod transport/on-listen! :queue [_channel opts]
  {:exclusive (boolean (:exclusive opts))})

(defmethod transport/wrap-listener :queue [_channel listener]
  listener)
