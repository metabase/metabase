(ns metabase.query-processor.middleware.cache.poll
  "Deduplicated background polling: many callers await the outcome of a single polling loop per key per JVM. The
  first caller to await a key starts its loop on a shared executor; every other caller for that key awaits the same
  outcome."
  (:require
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent ExecutorService Executors)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)))

(set! *warn-on-reflection* true)

(defonce ^:private executor
  (delay
    (Executors/newCachedThreadPool
     (.build
      (doto (BasicThreadFactory$Builder.)
        (.namingPattern "qp-cache-poller-%d")
        (.daemon true))))))

(defonce ^:private pollers
  ;; poll key -> promise delivered with that key's polling-loop outcome
  (atom {}))

(defn await-outcome
  "The outcome of the polling loop for `poll-key`, starting one if none is running on this instance yet: the first
  caller to await a key runs `poll-fn` -- a zero-arg fn whose return value is the outcome -- on a background thread,
  with that caller's dynamic bindings conveyed; every caller for the key receives the same outcome. Waits at most
  `timeout-ms`. `fallback-outcome` is returned to this caller on timeout, and delivered to every waiter if `poll-fn`
  throws, so callers can never hang on a failed loop."
  [poll-key poll-fn timeout-ms fallback-outcome]
  (let [my-signal (promise)
        signal    (-> (swap! pollers (fn [pollers]
                                       (cond-> pollers
                                         (not (pollers poll-key)) (assoc poll-key my-signal))))
                      (get poll-key))]
    (when (identical? signal my-signal)
      (.execute ^ExecutorService @executor
                (bound-fn []
                  (try
                    (deliver my-signal (poll-fn))
                    (catch Throwable e
                      (log/errorf e "Polling loop for %s failed: %s" (pr-str poll-key) (ex-message e)))
                    (finally
                      (swap! pollers dissoc poll-key)
                      ;; no-op when the outcome was already delivered
                      (deliver my-signal fallback-outcome))))))
    (deref signal timeout-ms fallback-outcome)))
