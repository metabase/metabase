(ns metabase.mq.queue.test-util
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.queue.sync :as q.sync]))

(comment q.sync/keep-me)

(defmacro with-memory-queue
  "Binds the queue system to a fresh, isolated in-memory backend.
   Safe for ^:parallel tests."
  [& body]
  `(binding [q.backend/*backend*      :queue.backend/memory
             q.backend/*handlers*     (atom {})
             q.memory/*queues*        (atom {})
             q.memory/*batch-registry* (atom {})]
     ~@body))

(defmacro with-sync-queue
  "Binds the queue system to the synchronous backend, which invokes handlers
   inline during `publish!`. Optionally accepts an overrides map to replace
   existing handler fns by queue name. Throws if an override key doesn't match
   an already-registered handler."
  [& body]
  (let [[overrides & body] (if (map? (first body))
                             body
                             (cons {} body))]
    `(let [current#  @q.backend/*handlers*
           overrides# ~overrides
           unknown#  (remove (set (keys current#)) (keys overrides#))]
       (when (seq unknown#)
         (throw (ex-info "Cannot override handlers that are not already registered"
                         {:unknown (vec unknown#)
                          :registered (vec (keys current#))})))
       (binding [q.backend/*backend*  :queue.backend/sync
                 q.backend/*handlers* (atom (merge current# overrides#))]
         ~@body))))
