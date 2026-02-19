(ns metabase.mq.queue.test-util
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory]))

(defmacro with-memory-queue
  "Binds the queue system to a fresh, isolated in-memory backend.
   Safe for ^:parallel tests."
  [& body]
  `(binding [q.backend/*backend*      :queue.backend/memory
             q.backend/*handlers*     (atom {})
             q.memory/*queues*        (atom {})
             q.memory/*batch-registry* (atom {})]
     ~@body))
