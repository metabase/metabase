(ns metabase.mq.topic.transport-impl
  "Topic implementations of the transport multimethods."
  (:require
   [metabase.mq.listener :as listener]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.transport :as transport]))

(set! *warn-on-reflection* true)

(def keep-me
  "Referenced from [[metabase.mq.core]] to ensure this namespace is loaded."
  true)

(defmethod transport/on-listen! :topic [channel _opts]
  (topic.backend/subscribe! topic.backend/*backend* channel)
  {})

(defmethod transport/publish! :topic [channel messages]
  (topic.backend/publish! topic.backend/*backend* channel messages))

(defmethod transport/wrap-listener :topic [channel listener]
  (listener/make-instrumented-listener channel listener))
