(ns metabase.mq.queue.test-util
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.queue.tracking :as q.tracking]))

(defmacro with-memory-queue
  "Binds the queue system to a fresh, isolated in-memory backend with test tracking.
   Safe for ^:parallel tests. The bound `recent` map tracks callbacks
   for this test only."
  [[recent-binding] & body]
  `(let [fresh-recent# {:successful-callbacks  (atom [])
                        :failed-callbacks      (atom [])
                        :close-queue-callbacks (atom [])}]
     (binding [q.backend/*backend*     :queue.backend/tracking
               q.backend/*handlers*   (atom {})
               q.memory/*queues*          (atom {})
               q.memory/*batch-registry* (atom {})
               q.tracking/*recent*       fresh-recent#]
       (let [~recent-binding fresh-recent#]
         ~@body))))
