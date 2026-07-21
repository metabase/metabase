(ns metabase.mq.queue.concurrency
  "Per-node in-flight accounting for queues that declare `:max-concurrent-batches`.

  **The cap is a soft limit — a throttle, not a guarantee.** It is enforced by not *taking* work.

  What it deliberately does *not* do is refuse a batch that reaches us anyway. If a backend is racy a node
  can end up a batch or two over its cap. That is fine.

  A queue that declares no cap is unbounded — on every backend. It is never at capacity and reports no
  fetch limit.

  This is a per-node cap, not a cluster-wide one. For cluster-wide mutual exclusion see the queue's
  `:exclusive` flag — a queue picks one or the other, never both (the registry rejects a config that
  declares both). `:exclusive` *is* a hard guarantee; this is not."
  (:require
   [metabase.mq.listener :as listener]
   [metabase.mq.queue.registry :as q.registry])
  (:import
   (java.util.concurrent Callable ExecutorService)))

(set! *warn-on-reflection* true)

(def ^:dynamic *in-flight*
  "channel → how many batches this node is currently delivering for it. A channel with nothing in
  flight is absent rather than zero, so the map stays small.

  Test fixtures rebind this to a fresh atom so in-flight counts don't leak across scenarios (matching
  `registry/*queues*` and `listener/*listeners*`). Production code uses the root binding."
  (atom {}))

(defn in-flight
  "How many batches of `channel` this node is delivering right now."
  [channel]
  (get @*in-flight* channel 0))

(defn- at-limit?
  "True if `counts` already has `limit` batches of `channel` in flight. A nil `limit` means the queue
  declared no cap, which is never at the limit."
  [counts channel limit]
  (boolean (and limit (>= (get counts channel 0) limit))))

(defn- take-slot!
  "Records that this node has started delivering a batch of `channel`."
  [channel]
  (swap! *in-flight* update channel (fnil inc 0))
  nil)

(defn- release-slot!
  "Records that a batch of `channel` has finished delivering.

  Floors at zero rather than going negative: a double-release must not manufacture throughput the
  queue never declared."
  [channel]
  (swap! *in-flight*
         (fn [counts]
           (let [remaining (dec (get counts channel 0))]
             (if (pos? remaining)
               (assoc counts channel remaining)
               (dissoc counts channel)))))
  nil)

(defn do-with-slot
  "Function form of [[with-slot]]."
  [channel f]
  (take-slot! channel)
  (try
    (f)
    (finally
      (release-slot! channel))))

(defmacro with-slot
  "Runs `body` while counting one in-flight delivery of `channel` against the node, and stops counting
  it however `body` exits. Returns `body`'s value."
  {:style/indent 1}
  [channel & body]
  `(do-with-slot ~channel (fn [] ~@body)))

(defn submit-with-slot!
  "The asynchronous counterpart to [[with-slot]], for a caller that hands delivery off to a thread
  pool: the slot is taken *here*, on the calling thread, but released on the worker thread once
  `body-fn` finishes.

  Taking it here rather than inside the task matters — it means a batch counts against the node from
  the moment it is handed off, so the very next [[free-slots]]/[[at-capacity?]] check sees it, instead
  of the driver fetching more work in the window before the worker thread gets going.

  Submits `body-fn` (0-arg) to `executor` to run holding the slot. The slot is released however
  `body-fn` exits, and `after-release` (0-arg) then runs on that same thread — that is where 'a slot
  just freed up, go look for more work' belongs, since it must not run while the slot is still held.

  If the *submit itself* throws — the pool is shut down, so `body-fn` will never run and never release
  — the slot is released before the exception propagates. A failed hand-off must not leak capacity.

  Dynamic bindings are conveyed to the worker thread, so the slot is released against the very
  [[*in-flight*]] that took it (rather than the root binding, which would corrupt test isolation and
  leak a slot in the fixture's map)."
  [channel ^ExecutorService executor body-fn after-release]
  (take-slot! channel)
  (let [^Callable task (bound-fn []
                         (try
                           (body-fn)
                           (finally
                             (release-slot! channel)
                             (after-release))))]
    (try
      (.submit executor task)
      (catch Throwable t
        (release-slot! channel)
        (throw t)))))

(defn at-capacity?
  "True if this node is already delivering at least `channel`'s `:max-concurrent-batches`. A queue with
  no declared cap is never at capacity."
  [channel]
  (at-limit? @*in-flight* channel (q.registry/max-concurrent-batches channel)))

(defn working?
  "True if `channel` has at least one delivery in flight on this node. Ask this to find out whether anything is
  still running (shutdown, test quiescence); ask [[at-capacity?]] to decide whether to take more work."
  [channel]
  (pos? (in-flight channel)))

(defn working-channels
  "The set of channels with at least one delivery in flight on this node."
  []
  (set (keys @*in-flight*)))

(defn free-slots
  "How many more batches of `channel` this node may take right now: its `:max-concurrent-batches` minus
  what's in flight, floored at zero — or **nil when the queue declares no cap**, meaning take as many
  as you have.

  A backend may fetch *fewer* than this — that's how a poll backend implements `:exclusive`, which is a
  backend concern and deliberately not modelled here."
  [channel]
  (when-let [limit (q.registry/max-concurrent-batches channel)]
    (max 0 (- limit (in-flight channel)))))

(defn takeable-queues
  "The queues this node will take work for *right now*: the ones it has a listener for, minus the ones
  it is [[at-capacity?]] on.

  Recomputed per call, so a listener registering and a slot freeing up both take effect immediately."
  []
  (remove at-capacity? (listener/queue-names)))
