(ns metabase.mq.topic.transport-impl
  "Topic implementations of the transport-level multimethods in
  `metabase.mq.transport`. Owns the listener-instrumentation wrapper that adds
  Prometheus counters to topic handlers."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.transport :as transport]))

(set! *warn-on-reflection* true)

(defn- make-instrumented-listener
  "Wraps a listener with Prometheus metrics instrumentation."
  [channel listener]
  (let [labels   {:transport (namespace channel) :channel (name channel)}
        received :metabase-mq/messages-received
        errors   :metabase-mq/topic-handler-errors]
    (fn [msg]
      (try
        (listener msg)
        (analytics/inc! received labels)
        (catch Exception e
          (analytics/inc! errors labels)
          (throw e))))))

(defmethod transport/on-listen! :topic [channel _opts]
  (topic.backend/subscribe! topic.backend/*backend* channel)
  {})

(defmethod transport/wrap-listener :topic [channel listener]
  (make-instrumented-listener channel listener))
