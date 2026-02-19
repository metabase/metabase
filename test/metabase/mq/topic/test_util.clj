(ns metabase.mq.topic.test-util
  (:require
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.memory :as topic.memory]
   [metabase.mq.topic.postgres :as topic.postgres]))

(defmacro with-memory-topics
  "Binds the topic system to a fresh, isolated in-memory backend.
   Safe for ^:parallel tests."
  [& body]
  `(binding [topic.backend/*backend*      :topic.backend/memory
             topic.backend/*handlers*     (atom {})
             topic.memory/*topics*        (atom {})
             topic.memory/*subscriptions* (atom {})]
     ~@body))

(defmacro with-postgres-topics
  "Binds the topic system to a fresh, isolated postgres backend.
   Ensures the listener is started and stopped within the test scope."
  [& body]
  `(binding [topic.backend/*backend*  :topic.backend/postgres
             topic.backend/*handlers* (atom {})]
     (try
       ~@body
       (finally
         (topic.postgres/stop-listener!)))))
