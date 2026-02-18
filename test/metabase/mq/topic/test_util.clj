(ns metabase.mq.topic.test-util
  (:require
   [metabase.mq.topic.backend :as tp.backend]
   [metabase.mq.topic.memory :as tp.memory]
   [metabase.mq.topic.postgres :as tp.postgres]
   [metabase.mq.topic.tracking :as tp.tracking]))

(defmacro with-memory-topics
  "Binds the topic system to a fresh, isolated in-memory backend with tracking.
   Safe for ^:parallel tests. The bound `recent` map tracks callbacks
   for this test only."
  [[recent-binding] & body]
  `(let [fresh-recent# {:published-messages (atom [])
                        :received-messages  (atom [])
                        :errors             (atom [])}]
     (binding [tp.backend/*backend*      :topic.backend/tracking
               tp.backend/*handlers*     (atom {})
               tp.memory/*topics*        (atom {})
               tp.memory/*subscriptions* (atom {})
               tp.tracking/*recent*      fresh-recent#]
       (let [~recent-binding fresh-recent#]
         ~@body))))

(defmacro with-postgres-topics
  "Binds the topic system to a fresh, isolated postgres backend.
   Ensures the listener is started and stopped within the test scope."
  [& body]
  `(binding [tp.backend/*backend*  :topic.backend/postgres
             tp.backend/*handlers* (atom {})]
     (try
       ~@body
       (finally
         (tp.postgres/stop-listener!)))))
