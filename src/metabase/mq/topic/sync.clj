(ns metabase.mq.topic.sync
  "Synchronous topic backend that calls listeners inline during `publish!`.
  Useful in tests to avoid Thread/sleep for polling-based backends."
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.topic.backend :as topic.backend]))

(set! *warn-on-reflection* true)

(defrecord SyncTopicBackend []
  topic.backend/TopicBackend
  (publish!     [_this topic-name messages]
    (mq.impl/handle! topic-name {} messages)
    nil)
  (subscribe!   [_this _topic-name] nil)
  (unsubscribe! [_this _topic-name] nil)
  (start!       [_this] nil)
  (shutdown!    [_this] nil))

(def backend
  "Singleton instance of the sync topic backend."
  (->SyncTopicBackend))
