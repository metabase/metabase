(ns metabase.mq.pubsub.test-util
  (:require
   [metabase.mq.pubsub.backend :as ps.backend]
   [metabase.mq.pubsub.listener :as ps.listener]
   [metabase.mq.pubsub.memory :as ps.memory]
   [metabase.mq.pubsub.postgres :as ps.postgres]))

(defmacro with-memory-pubsub
  "Binds the pub/sub system to a fresh, isolated in-memory backend.
   Safe for ^:parallel tests. The bound `recent` map tracks callbacks
   for this test only."
  [[recent-binding] & body]
  `(let [fresh-recent# {:published-messages (atom [])
                        :received-messages  (atom [])
                        :errors             (atom [])}]
     (binding [ps.backend/*backend*   :mq.pubsub.backend/memory
               ps.listener/*handlers* (atom {})
               ps.memory/*topics*        (atom {})
               ps.memory/*subscriptions* (atom {})
               ps.memory/*recent*        fresh-recent#]
       (let [~recent-binding fresh-recent#]
         ~@body))))

(defmacro with-postgres-pubsub
  "Binds the pub/sub system to a fresh, isolated postgres backend.
   Ensures the listener is started and stopped within the test scope."
  [& body]
  `(binding [ps.backend/*backend*   :mq.pubsub.backend/postgres
             ps.listener/*handlers* (atom {})]
     (try
       ~@body
       (finally
         (ps.postgres/stop-listener!)))))
