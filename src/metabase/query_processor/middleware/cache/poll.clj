(ns metabase.query-processor.middleware.cache.poll
  "Deduplicated background polling: many callers await the outcome of a single polling loop per key per JVM. The
  first caller to await a key starts its loop on an executor; every other caller for that key awaits the same
  outcome."
  (:require
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent ExecutorService Executors RejectedExecutionException)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)))

(set! *warn-on-reflection* true)

(defn poller-context
  "An isolated set of polling state: an executor for the loops and a registry of the in-flight ones. The process
  normally runs on a single global context; bind [[*context*]] to a fresh one to isolate polling state (e.g. one per
  mocked system in tests, so its pollers and waiters can't cross-talk with another's), and release it with
  [[shutdown-context!]]."
  []
  {:executor (Executors/newCachedThreadPool
              (.build
               (doto (BasicThreadFactory$Builder.)
                 (.namingPattern "qp-cache-poller-%d")
                 (.daemon true))))
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
