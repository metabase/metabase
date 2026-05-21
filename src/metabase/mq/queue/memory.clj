(ns metabase.mq.queue.memory
  "In-memory queue backend. Delegates message storage to a shared memory layer (an id-keyed map,
  like appdb's table) and the poll loop to the shared [[metabase.mq.queue.polling]] driver. Each
  `MemoryQueueBackend` carries a reference to its layer so tests can construct isolated instances.

  Being single-process and non-durable, the in-memory backend has no crashed-consumer recovery,
  no cross-node lease to heartbeat, and nothing to clean up, so those maintenance hooks are
  no-ops; only the depth gauge does real work."
  (:require
   [metabase.mq.memory :as memory]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.polling :as q.polling]))

(set! *warn-on-reflection* true)

(def backend-id
  "This backend's identifier, registered with `metabase.mq.init`; its `name` labels metrics."
  :queue.backend/memory)

(defrecord MemoryQueueBackend [layer poll-context]
  q.backend/QueueBackend

  (backend-id [_this] backend-id)

  (publish! [_this queue-name payload]
    (memory/publish! layer queue-name payload))

  (fetch! [_this available-queues]
    (into [] (keep #(memory/take-oldest layer %)) available-queues))

  (queue-depths [_this]
    (memory/depths layer))

  ;; The batch-id is the layer-unique message id, so the queue isn't needed to resolve it.
  (batch-successful! [_this _queue-name batch-id]
    (memory/ack! layer batch-id))

  (failure-count [_this _queue-name batch-id]
    (memory/message-failures layer batch-id))

  (retry-batch! [_this _queue-name batch-id]
    (memory/retry! layer batch-id))

  (fail-batch! [_this _queue-name batch-id]
    (memory/ack! layer batch-id))

  (recover-stale! [_this _stale-timeout-ms _max-retries] nil)

  (run-heartbeats! [_this] nil)

  (start! [this]
    (q.polling/start! this poll-context "Memory" 50))

  (shutdown! [_this]
    (q.polling/stop! poll-context "Memory")
    (memory/clear! layer)))

(defn make-backend
  "Constructs a `MemoryQueueBackend` with its own poll context. With no args, wraps the
  process-wide `memory/default-layer`. Tests can pass their own layer for isolation."
  ([] (make-backend memory/default-layer))
  ([layer] (->MemoryQueueBackend layer (q.polling/make-poll-context))))

(def backend
  "Singleton `MemoryQueueBackend` backed by `memory/default-layer`."
  (make-backend))
