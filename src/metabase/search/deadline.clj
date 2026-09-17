(ns metabase.search.deadline
  "Cooperative deadlines for synchronous search rebuilds. No worker is detached or forcibly terminated."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.search.schema :as search.schema]
   [metabase.search.settings :as search.settings]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.jdbc.options :as jdbc.options])
  (:import
   (java.util.concurrent ScheduledFuture ScheduledThreadPoolExecutor ThreadFactory TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:dynamic *observation-grace-ms*
  "Delay after a deadline before reporting a worker that has not exited."
  30000)

(def ^:dynamic *run-context*
  "The current run's identity, monotonic deadline, worker, and terminal state; nil outside a rebuild."
  nil)

(defonce ^:private active-runs (atom #{}))

(defonce ^:private scheduler
  (delay
    (doto (ScheduledThreadPoolExecutor.
           1
           (reify ThreadFactory
             (newThread [_ runnable]
               (doto (Thread. runnable "search-reindex-deadline")
                 (.setDaemon true)))))
      (.setRemoveOnCancelPolicy true))))

(defn- report! [{:keys [identity run-id]} event]
  (log/errorf "Search rebuild %s: %s (%s). If it remains stuck, restart this process and verify scheduling resumes."
              run-id (name event) identity)
  (try
    (analytics/inc! :metabase-search/reindex-lease-events {:engine (:engine identity), :event event})
    (catch Exception e
      (log/warnf "Failed to publish search deadline event: %s" (ex-message e)))))

(defn- expire! [{:keys [state worker] :as context}]
  (when (locking state
          (when (= :running (:status @state))
            (swap! state assoc :status :timed-out)
            ;; Finishing takes this same lock, so the timer cannot interrupt a reused scheduler thread.
            (.interrupt ^Thread worker)
            true))
    (report! context :timeout)))

(defn timed-out?
  "Whether the current run has crossed its deadline, including when its timer has not been scheduled yet."
  []
  (when-let [{:keys [started-ns state timeout-ns] :as context} *run-context*]
    (when (and (pos? timeout-ns) (>= (- (System/nanoTime) started-ns) timeout-ns))
      (expire! context))
    (= :timed-out (:status @state))))

(defn check!
  "Refuse further work after the current run's deadline."
  []
  (when (timed-out?)
    (throw (ex-info "Search rebuild deadline exceeded"
                    {:run-id (:run-id *run-context*), :type ::exceeded}))))

(defn clear-timeout-interrupt!
  "Clear the timer's interrupt before releasing resources; the terminal timeout state remains authoritative."
  []
  (when (= :timed-out (some-> *run-context* :state deref :status))
    (Thread/interrupted)))

(defn- schedule! [delay-ms f]
  (.schedule ^ScheduledThreadPoolExecutor @scheduler ^Runnable f (long delay-ms) TimeUnit/MILLISECONDS))

(mu/defn- run-context :- ::search.schema/deadline-context
  [identity :- ::search.schema/deadline-identity, timeout-ms :- :int]
  {:identity   identity
   :run-id     (str (random-uuid))
   :started-ns (System/nanoTime)
   :state      (atom {:exited? false, :status :running})
   :timeout-ns (* 1000000 timeout-ms)
   :worker     (Thread/currentThread)})

(defn- run-with-deadline [identity thunk]
  (let [timeout-ms (* 60000 (long (search.settings/search-reindex-timeout-minutes)))
        context    (run-context identity timeout-ms)
        state      (:state context)
        tasks      (volatile! [])
        statement-timeout (:timeout jdbc.options/*options*)]
    (binding [*run-context* context
              ;; This binding is conveyed to the heartbeat and to streaming source reductions, but never changes
              ;; global app-db options. Smaller explicit caller limits remain in force.
              jdbc.options/*options* (assoc jdbc.options/*options* :timeout
                                            (if (and statement-timeout (pos? statement-timeout))
                                              (min 60 statement-timeout)
                                              60))]
      (try
        (when (pos? timeout-ms)
          (vswap! tasks conj (schedule! timeout-ms (bound-fn [] (expire! context))))
          (vswap! tasks conj
                  (schedule! (+ timeout-ms *observation-grace-ms*)
                             (bound-fn []
                               (when (and (= :timed-out (:status @state)) (not (:exited? @state)))
                                 (report! context :worker-stuck))))))
        (let [result (thunk)]
          (locking state
            (check!)
            (swap! state assoc :status :finished))
          result)
        (catch Throwable e
          (if (timed-out?)
            (throw (ex-info "Search rebuild deadline exceeded"
                            {:run-id (:run-id context), :type ::exceeded}
                            e))
            (throw e)))
        (finally
          (locking state
            (swap! state #(assoc % :exited? true :status (if (= :running (:status %)) :finished (:status %))))
            (when (= :timed-out (:status @state))
              (Thread/interrupted)))
          (doseq [^ScheduledFuture task @tasks]
            (when task (.cancel task false))))))))

(defn do-with-run
  "Run `thunk` synchronously with a deadline, or return an unacquired result while this app-db/engine is busy locally.
  The local slot stays occupied until the worker actually exits, even if its lease expires."
  [identity thunk]
  (if (locking active-runs
        (when-not (contains? @active-runs identity)
          (swap! active-runs conj identity)
          true))
    (try
      (run-with-deadline identity thunk)
      (finally
        (swap! active-runs disj identity)))
    {:acquired? false}))
