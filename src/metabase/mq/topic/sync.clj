(ns metabase.mq.topic.sync
  "Synchronous topic backend that calls listeners inline during `publish!`.
  Useful in tests to avoid Thread/sleep for polling-based backends."
  (:require
   [metabase.mq.topic.backend :as topic.backend]))

(set! *warn-on-reflection* true)

(defmethod topic.backend/publish! :topic.backend/sync
  [_ _topic-name _messages]
  nil)

(defmethod topic.backend/start! :topic.backend/sync [_] nil)
(defmethod topic.backend/subscribe! :topic.backend/sync [_ _topic-name] nil)
(defmethod topic.backend/unsubscribe! :topic.backend/sync [_ _topic-name] nil)
(defmethod topic.backend/shutdown! :topic.backend/sync [_] nil)
