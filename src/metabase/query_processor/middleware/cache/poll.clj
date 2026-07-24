(ns metabase.query-processor.middleware.cache.poll
  "Deduplicated background polling: many callers await the outcome of a single polling loop per key per JVM. The
  first caller to await a key starts its loop on an executor; every other caller for that key awaits the same
  outcome.

  Why poll rather than issue one blocking DB call that returns when the results land:

  - No portable primitive. The app DB may be H2, Postgres, or MySQL; only some of them offer a wait-for-event
    mechanism (LISTEN/NOTIFY, GET_LOCK), so a blocking design needs a per-DB implementation plus a polling
    fallback for the rest.
  - Connection pool. A blocking wait pins a pooled connection for its whole duration, and the number of waiters is
    unbounded (every concurrent request for the same query). Exhausting the pool degrades the entire instance, not
    just caching. A poll tick borrows a connection only for a cheap read.
  - The condition is state, not an event. A waiter is waiting for another process's transaction to commit
    fresh-enough results, which is not the same event as a lease being released: the holder can die, its lease can
    expire, and another node can take over. So the predicate has to be re-evaluated, which is what a poll does.
  - Cancellation. The loop rechecks its deadline and interrupt status every tick, so query timeouts and shutdown
    take effect promptly; an in-flight blocking DB call ignores interrupts and holds its thread and connection
    until the DB-side timeout.

  Deduplication is what keeps the cost acceptable: the DB sees one poller per key per node, not one per request."
  (:require
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent ExecutorService Executors RejectedExecutionException)))

(set! *warn-on-reflection* true)

(defn poller-context
  "An isolated set of polling state: an executor for the loops and a registry of the in-flight ones. The process
  normally runs on a single global context; bind [[*context*]] to a fresh one to isolate polling state (e.g. one per
  mocked system in tests, so its pollers and waiters can't cross-talk with another's), and release it with
  [[shutdown-context!]]."
  []
  {:executor (Executors/newCachedThreadPool
              ;; platform, not virtual, threads: the loops block on JDBC, which can pin a carrier thread
              (.factory (.name (.daemon (Thread/ofPlatform)) "qp-cache-poller-" 0)))
   ;; poll key -> {:signal <promise>, :fallback-outcome <any>}
   :pollers  (atom {})})

(defonce ^:private global-context
  (delay (poller-context)))

(def ^:dynamic *context*
  "The [[poller-context]] in use; nil means the process-wide global context."
  nil)

(defn- current-context []
  (or *context* @global-context))

(defn await-outcome
  "The outcome of the polling loop for `poll-key`, starting one if none is running in the current context yet: the
  first caller to await a key runs `poll-fn` -- a zero-arg fn whose return value is the outcome -- on a background
  thread, with that caller's dynamic bindings conveyed; every caller for the key receives the same outcome. Waits at
  most `timeout-ms`. `fallback-outcome` is returned to this caller on timeout, and delivered to every waiter if
  `poll-fn` throws or the context shuts down, so callers can never hang on a failed loop."
  [poll-key poll-fn timeout-ms fallback-outcome]
  (let [{:keys [^ExecutorService executor pollers]} (current-context)
        my-signal        (promise)
        {signal :signal} (-> (swap! pollers (fn [pollers]
                                              (cond-> pollers
                                                (not (pollers poll-key))
                                                (assoc poll-key {:signal           my-signal
                                                                 :fallback-outcome fallback-outcome}))))
                             (get poll-key))]
    (when (identical? signal my-signal)
      (try
        (.execute executor
                  (bound-fn []
                    (try
                      (deliver my-signal (poll-fn))
                      ;; interruption means the context is shutting down; the fallback delivery below wakes waiters
                      (catch InterruptedException _)
                      (catch Throwable e
                        (log/errorf e "Polling loop for %s failed: %s" (pr-str poll-key) (ex-message e)))
                      (finally
                        (swap! pollers dissoc poll-key)
                        ;; no-op when the outcome was already delivered
                        (deliver my-signal fallback-outcome)))))
        (catch RejectedExecutionException _
          ;; the context shut down before the loop could start
          (swap! pollers dissoc poll-key)
          (deliver my-signal fallback-outcome))))
    (deref signal timeout-ms fallback-outcome)))

(defn shutdown-context!
  "Shut down an isolated [[poller-context]]: interrupt its polling loops, wake anything still awaiting them with
  their fallback outcomes, and release its threads."
  [{:keys [^ExecutorService executor pollers]}]
  (.shutdownNow executor)
  (doseq [[_poll-key {:keys [signal fallback-outcome]}] @pollers]
    (deliver signal fallback-outcome))
  (reset! pollers {})
  nil)
