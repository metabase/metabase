(ns metabase.mq.topic.sync
  "Synchronous topic backend that calls handlers inline during `publish!`.
  Useful in tests to avoid Thread/sleep for polling-based backends."
  (:require
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]))

(set! *warn-on-reflection* true)

(defmethod topic.backend/publish! :topic.backend/sync
  [_ topic-name messages]
  (let [batch-id (str (random-uuid))]
    (topic.impl/handle! topic-name messages)))

(defmethod topic.backend/subscribe! :topic.backend/sync [_ _topic-name] nil)
(defmethod topic.backend/unsubscribe! :topic.backend/sync [_ _topic-name] nil)
(defmethod topic.backend/shutdown! :topic.backend/sync [_] nil)
