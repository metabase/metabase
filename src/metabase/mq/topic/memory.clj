(ns metabase.mq.topic.memory
  "In-memory topic backend. Delegates storage and polling to the shared memory layer."
  (:require
   [metabase.mq.memory :as memory]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defmethod topic.backend/start! :topic.backend/memory [_]
  (memory/start!))

(defmethod topic.backend/publish! :topic.backend/memory [_ topic-name messages]
  (memory/publish! topic-name messages))

(defmethod topic.backend/subscribe! :topic.backend/memory [_ topic-name]
  (log/infof "Memory subscribed to topic %s" (name topic-name)))

(defmethod topic.backend/unsubscribe! :topic.backend/memory [_ topic-name]
  (log/infof "Memory unsubscribed from topic %s" (name topic-name)))

(defmethod topic.backend/shutdown! :topic.backend/memory [_]
  (memory/shutdown!))
