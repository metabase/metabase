(ns metabase.mq.queue.memory
  "In-memory queue backend. Delegates storage and polling to a shared memory layer.
  The layer holds the batch registry for retry tracking — each `MemoryQueueBackend`
  carries a reference to its layer so tests can construct isolated instances."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.mq.memory :as memory]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.settings :as mq.settings]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defrecord MemoryQueueBackend [layer]
  q.backend/QueueBackend

  (publish! [_this queue-name messages]
    (memory/publish! layer queue-name messages))

  (batch-successful! [_this _queue-name batch-id]
    (swap! (:batch-registry layer) dissoc batch-id))

  (batch-failed! [_this queue-name batch-id]
    (let [registry (:batch-registry layer)]
      (when-let [{:keys [messages failures]} (get @registry batch-id)]
        (swap! registry dissoc batch-id)
        (let [new-failures (inc failures)]
          (if (>= new-failures (mq.settings/queue-max-retries))
            (do
              (log/warnf "Batch %s has reached max failures (%d), dropping" batch-id (mq.settings/queue-max-retries))
              (analytics/inc! :metabase-mq/queue-batch-permanent-failures {:channel (name queue-name)}))
            (do
              (analytics/inc! :metabase-mq/queue-batch-retries {:channel (name queue-name)})
              ;; Re-queue messages for retry
              (memory/publish! layer queue-name messages)))))))

  (start! [this]
    (reset! (:queue-backend layer) this)
    (memory/start! layer))

  (shutdown! [_this]
    (memory/shutdown! layer)))

(defn make-backend
  "Constructs a `MemoryQueueBackend`. With no args, wraps the process-wide
  `memory/default-layer`. Tests can pass their own layer for isolation."
  ([] (make-backend memory/default-layer))
  ([layer] (->MemoryQueueBackend layer)))

(def backend
  "Singleton `MemoryQueueBackend` backed by `memory/default-layer`."
  (make-backend))
