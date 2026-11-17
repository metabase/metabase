(ns metabase.mq.queue.memory
  "In-memory queue backend. Delegates message storage to a shared memory layer (an id-keyed map,
  like appdb's table) and the poll loop to the shared [[metabase.mq.queue.polling]] driver. Each
  `MemoryQueueBackend` carries a reference to its layer so tests can construct isolated instances.

  Being single-process and non-durable, the in-memory backend has no crashed-consumer recovery,
  no cross-node lease to heartbeat, and nothing to clean up, so those maintenance hooks are
  no-ops; only the depth gauge does real work."
  (:require
   [metabase.mq.listener :as listener]
   [metabase.mq.memory :as memory]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.polling :as q.polling]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def backend-id
  "This backend's identifier, registered with `metabase.mq.init`; its `name` labels metrics."
  :queue.backend/memory)

(defn- fetch-count
  "How many batches to take for `queue` this pass: normally the driver's `free-slots` (nil = unbounded).

  An `:exclusive` queue is capped at one in flight — and only if none already is. That's this
  backend's implementation of the flag; the poll driver has no notion of exclusivity, and shouldn't:
  it's the backend that owns delivery, so it's the backend that has to enforce mutual exclusion. Being
  single-process, one-per-node here *is* the cluster-wide guarantee the flag promises.

  Safe to check-then-take without a lock: only the poll thread claims messages, and everything else
  (ack, retry, stale recovery) only ever *releases* claims — so the count can fall between the check
  and the take, never rise."
  [layer queue free-slots]
  (if (q.registry/exclusive? queue)
    (if (memory/has-claim? layer queue) 0 1)
    free-slots))

(defrecord MemoryQueueBackend [layer poll-context]
  q.backend/QueueBackend

  (backend-id [_this] backend-id)

  (publish! [_this queue-name payload]
    (memory/publish! layer queue-name payload))

  (fetch! [_this queue->free-slots]
    (into []
          (mapcat (fn [[queue free-slots]]
                    (memory/take-pending! layer queue (fetch-count layer queue free-slots))))
          queue->free-slots))

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

  ;; There is no crashed *node* to recover from (single process), but there is still a crashed
  ;; *delivery*: a message claimed by `take-pending!` whose worker never acked it would stay marked
  ;; in-flight and never be fetched again. Clearing those stale claims is the in-memory equivalent of
  ;; a broker's visibility timeout.
  ;;
  ;; The hook is also reused to reclaim messages for queues that have no listener: on a
  ;; single-process, non-durable backend such messages can never be delivered, so leaving them would
  ;; grow the store and the depth gauge without bound (unlike a persistent, cross-node backend, where
  ;; another node may own the listener).
  (recover-stale! [_this stale-timeout-ms _max-retries]
    (let [dropped (memory/drop-orphaned! layer (set (listener/queue-names)))]
      (when (pos? dropped)
        (log/debugf "Dropped %d orphaned in-memory message(s) for queues with no listener" dropped)))
    (let [recovered (memory/clear-stale-claims! layer stale-timeout-ms)]
      (when (pos? recovered)
        (log/warnf "Recovered %d in-memory message(s) whose delivery never completed" recovered)
        [{:channel :memory :recovered recovered :failed 0}])))

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
