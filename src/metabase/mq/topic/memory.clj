(ns metabase.mq.topic.memory
  "In-memory topic backend. Delegates storage and polling to a shared memory layer."
  (:require
   [metabase.mq.memory :as memory]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.util.log :as log])
  (:import (java.util.concurrent LinkedBlockingQueue)))

(set! *warn-on-reflection* true)

(defrecord MemoryTopicBackend [layer]
  topic.backend/TopicBackend
  (publish! [_this topic-name messages]
    (memory/publish! layer topic-name messages))
  (subscribe! [_this topic-name]
    ;; Match the appdb topic semantic: late subscribers don't see the backlog.
    ;; Clear any queued messages for this topic at subscribe time.
    (when-let [^LinkedBlockingQueue q (get @(:channels layer) topic-name)]
      (.clear q))
    (log/infof "Memory subscribed to topic %s" (name topic-name)))
  (unsubscribe! [_this topic-name]
    (log/infof "Memory unsubscribed from topic %s" (name topic-name)))
  (start! [_this] (memory/start! layer))
  (shutdown! [_this] (memory/shutdown! layer)))

(defn make-backend
  "Constructs a `MemoryTopicBackend`. With no args, wraps the process-wide
  `memory/default-layer`. Tests can pass their own layer for isolation."
  ([] (make-backend memory/default-layer))
  ([layer] (->MemoryTopicBackend layer)))

(def backend
  "Singleton `MemoryTopicBackend` backed by `memory/default-layer`."
  (make-backend))
