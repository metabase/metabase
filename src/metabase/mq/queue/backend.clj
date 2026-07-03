(ns metabase.mq.queue.backend
  "Backend abstraction for the message queue system.
  Each concrete backend (appdb, memory, sync) is a record implementing `QueueBackend`.")

(set! *warn-on-reflection* true)

(defprotocol QueueBackend
  "A queue backend handles durable storage, delivery, and retry semantics for queue messages.
  Every backend is poll-loop-driven: the shared driver (`metabase.mq.queue.polling`) runs the
  four maintenance tasks on a fixed cadence and the `fetch!`/submit cycle each iteration, so every
  backend gets identical loop and respin behavior. Maintenance tasks that don't apply to a backend
  (e.g. heartbeats for the single-process memory backend) are implemented as no-ops."
  (backend-id        [this]
    "Returns this backend's identifying keyword (e.g. `:queue.backend/redis`)")
  (publish!          [this queue-name payload]
    "Publishes a payload to the given queue. `payload` is an opaque, already-encoded string.
    The backend stores/transports it without looking inside.")
  (fetch!            [this available-queue-names]
    "Fetches up to one batch per given queue. Returns a seq of
    `{:queue :payload :batch-id}` maps (or nil/empty when there's nothing to do).")
  (queue-depths      [this]
    "Returns a seq of `{:channel :status :count}` maps describing current queue depth.")
  (batch-successful! [this queue-name batch-id]
    "Marks a batch as successfully processed.")
  (failure-count     [this queue-name batch-id]
    "Returns how many times the batch has already failed (0 on its first failure), or nil if the
    batch isn't owned/known by this backend — in which case the caller no-ops.")
  (retry-batch!      [this queue-name batch-id]
    "Re-enqueues the batch for another delivery attempt, incrementing its stored failure count.")
  (fail-batch!       [this queue-name batch-id]
    "Permanently drops / marks-failed the batch after it has exhausted its retries.")
  (recover-stale!    [this stale-timeout-ms max-retries]
    "Recovers batches in-flight longer than `stale-timeout-ms` (abandoned by a crashed/stale
    consumer) — re-queuing for retry, or dropping once `max-retries` is reached. Both thresholds
    are passed by the shared driver so the policy is uniform. Returns a seq of
    `{:channel :recovered :failed}` summarizing what happened per channel. Returns nil/empty when
    nothing was recovered.")
  (run-heartbeats!   [this]
    "Renews the in-flight lease on batches this node is currently processing.")
  (start!            [this]
    "Starts the backend polling loop. Called once at init time.")
  (shutdown!         [this]
    "Shuts down all queue resources for this backend."))

(def ^:dynamic *backend*
  "The active `QueueBackend` instance. Set by `metabase.mq.init/start!`."
  nil)

(def ^:private backend-unavailable-key ::backend-unavailable)

(defn backend-unavailable-ex
  "Build an exception marking that the *backend itself* is unreachable. `publish!` implementations
  throw this so callers can tell the two apart."
  ([msg data] (backend-unavailable-ex msg data nil))
  ([msg data cause] (ex-info msg (assoc data backend-unavailable-key true) cause)))

(defn backend-unavailable?
  "True if `e` (or anything in its cause chain) was built by [[backend-unavailable-ex]]."
  [^Throwable e]
  (boolean (some #(get (ex-data %) backend-unavailable-key)
                 (take-while some? (iterate ex-cause e)))))
