(ns metabase.mq.topic.transport-impl
  "Topic implementation of the transport-level multimethods in
  `metabase.mq.transport`."
  (:require
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.transport :as transport]))

(set! *warn-on-reflection* true)

(defmethod transport/on-listen! :topic [channel _opts]
  (topic.backend/subscribe! topic.backend/*backend* channel)
  {})
