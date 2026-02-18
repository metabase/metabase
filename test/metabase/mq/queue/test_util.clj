(ns metabase.mq.queue.test-util
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory]))

(defmacro with-memory-queue
  "Binds the queue system to a fresh, isolated in-memory backend.
   Safe for ^:parallel tests. The bound `recent` map tracks callbacks
   for this test only."
  [[recent-binding] & body]
  `(let [fresh-recent# {:successful-callbacks  (atom [])
                        :failed-callbacks      (atom [])
                        :close-queue-callbacks (atom [])}]
     (binding [q.backend/*backend*        :queue.backend/memory
               q.backend/*defined-queues* (atom {})
               q.memory/*queues*          (atom {})
               q.memory/*recent*          fresh-recent#]
       (let [~recent-binding fresh-recent#]
         ~@body))))
