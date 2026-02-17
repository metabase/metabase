(ns metabase.pubsub.test-util
  (:require
   [metabase.pubsub.backend :as ps.backend]
   [metabase.pubsub.listener :as ps.listener]
   [metabase.pubsub.memory :as ps.memory]))

(defmacro with-memory-pubsub
  "Binds the pub/sub system to a fresh, isolated in-memory backend.
   Safe for ^:parallel tests. The bound `recent` map tracks callbacks
   for this test only."
  [[recent-binding] & body]
  `(let [fresh-recent# {:published-messages (atom [])
                        :received-messages  (atom [])
                        :errors             (atom [])}]
     (binding [ps.backend/*backend*   :pubsub.backend/memory
               ps.listener/*handlers* (atom {})
               ps.memory/*topics*        (atom {})
               ps.memory/*subscriptions* (atom {})
               ps.memory/*recent*        fresh-recent#]
       (let [~recent-binding fresh-recent#]
         ~@body))))
