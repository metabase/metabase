(ns metabase.metabot.query-execution
  "Run a serialized MBQL query on behalf of an agent and return one bounded page of rows."
  (:require
   [clojure.core.async :as a]
   [metabase.api.common :as api]
   [metabase.driver.settings :as driver.settings]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]])
  (:import
   (java.util.concurrent ScheduledFuture ScheduledThreadPoolExecutor ThreadFactory TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private query-passthrough-keys
  "The only keys of an incoming query forwarded to the QP.
   Everything else — `:middleware`, `:info`, `:constraints`, and any unknown key — is this namespace's to set,
   because the query map is caller-controlled and an agent that could name its own `:info` would forge
   `query_execution` attribution.
   This whitelist, not the query schema, is what the guarantee rests on.
   The QP strips some of these itself; that is defense in depth, not this boundary's contract."
  [:lib/type :database :stages :parameters])

(defn- query-canceled
  "An agent error for a query that did not finish because the request it served was canceled."
  []
  (ex-info (tru "Query canceled: the request ended before the query finished.")
           {:agent-error? true
            :error        :query-canceled}))

(defn- query-timed-out
  "An agent error for a query that was stopped at its time limit."
  [timeout-ms]
  (ex-info (tru "Query timed out: it did not finish within {0} seconds. A narrower query may finish in time."
                (quot timeout-ms 1000))
           {:agent-error? true
            :error        :query-timed-out}))

(defonce ^:private time-limit-executor
  (delay
    (doto (ScheduledThreadPoolExecutor. 1
                                        (reify ThreadFactory
                                          (newThread [_ r]
                                            (doto (Thread. ^Runnable r "metabot-query-time-limit")
                                              (.setDaemon true)))))
      (.setRemoveOnCancelPolicy true))))

(defn- schedule-time-limit!
  "Call `stop!` after `timeout-ms`. Returns the task, which the caller cancels when the query ends."
  ^ScheduledFuture [timeout-ms stop!]
  (.schedule ^ScheduledThreadPoolExecutor @time-limit-executor ^Runnable stop! (long timeout-ms) TimeUnit/MILLISECONDS))

(defn- do-with-time-limit
  "Call `thunk`, canceling the query it runs on [[qp.pipeline/*canceled-chan*]] after `timeout-ms`.
   Sets `timed-out?` when the limit cancels it."
  [timeout-ms timed-out? thunk]
  ;; Rebinding `*query-timeout-ms*` would also stop the query, but a connection pool opened by this query would keep
  ;; the shorter limit as its leak timeout and kill the connections of every later query on that database.
  (let [canceled-chan qp.pipeline/*canceled-chan*
        task          (schedule-time-limit! timeout-ms (fn []
                                                         (reset! timed-out? true)
                                                         (a/put! canceled-chan ::timed-out)))]
    (try
      (thunk)
      (finally
        (.cancel task false)))))

(defn- execute!
  "Run a serialized MBQL query through the QP with the standard agent userland preparation.
   Caps this call's rows at `row-limit` (within the backend's 2000/10000 userland ceilings) and records the run
   under `context`, stopping it as [[execute-page!]] describes for `options`."
  [serialized-query row-limit context {:keys [request-canceled-chan timeout-ms]}]
  (let [query      (-> (select-keys serialized-query query-passthrough-keys)
                       (assoc :middleware {:js-int-to-string? true})
                       qp/userland-query-with-default-constraints
                       (assoc :constraints {:max-results           row-limit
                                            :max-results-bare-rows row-limit}
                              :info        {:executed-by api/*current-user-id*
                                            :context     context}))
        timeout-ms (some-> timeout-ms (min driver.settings/*query-timeout-ms*))
        timer      (u/start-timer)
        timed-out? (atom false)
        run        #(qp/process-query query)
        ;; Depending on how far it got, a stopped run comes back from the QP as a failure, as nothing,
        ;; as an exception, or as a completed result holding only the rows read before it stopped.
        ;; Each is reported as what stopped it, so the model never reads it as a broken query or a complete page.
        ;; The database query timeout can stop the run first when it is as short as the limit.
        ;; It stops a query no sooner than that, so a run that lasted as long as the limit was stopped by one of them.
        stopped    #(cond
                      (qp.pipeline/canceled?* request-canceled-chan)
                      (query-canceled)

                      (or @timed-out? (some-> timeout-ms (<= (u/since-ms timer))))
                      (query-timed-out timeout-ms))
        result     (try
                     ;; Each query gets its own channel.
                     ;; The QP closes it when the query ends and writes to it on a timeout.
                     ;; On one channel for the whole turn, either would cancel every later query.
                     ;; A query with a time limit needs its own channel even when no request can cancel it.
                     (qp.pipeline/do-with-own-canceled-chan
                      (or request-canceled-chan (when timeout-ms (a/promise-chan)))
                      (if timeout-ms
                        #(do-with-time-limit timeout-ms timed-out? run)
                        run))
                     (catch Throwable e
                       (throw (or (stopped) e))))]
    (when-let [e (stopped)]
      (throw e))
    (when-not (= (:status result) :completed)
      (throw (ex-info (if-let [error (:error result)]
                        (tru "Query failed: {0}" error)
                        (tru "Query failed: unknown error"))
                      {:agent-error?       true
                       :error              :query-failed
                       :query-error        (:error result)
                       ;; The QP's own refusal, as opposed to an error from the database.
                       :permissions-error? (= :missing-required-permissions (:error_type result))})))
    result))

(defn execute-page!
  "Run `serialized-query` for one page of at most `row-limit` rows, recorded under the QP `context`.
   Returns `{:cols :rows :returned :truncated?}`.
   The `truncated?` flag is true only when more rows exist, so a result that fills the page exactly is complete.
   A run that doesn't complete throws an agent error whose message carries the QP's error text.
   Its ex-data is `{:agent-error? true :error :query-failed :query-error <QP error text or nil>}`, with a true
   `:permissions-error?` when the QP refused the query because the current user may not run it.

   Two options stop a run early, each with an agent error of its own:
   - `:request-canceled-chan`, a promise channel that receives a value when the request being served is canceled.
     The error is `:query-canceled`.
   - `:timeout-ms`, a time limit for the run. The database query timeout still applies when it is shorter.
     The error is `:query-timed-out`."
  ([serialized-query row-limit context]
   (execute-page! serialized-query row-limit context nil))
  ([serialized-query row-limit context options]
   ;; Fetch one row past the limit so truncation is observed rather than inferred from a full page.
   ;; Dropping the probe row keeps `(last rows)` a real page boundary.
   (let [result     (execute! serialized-query (inc row-limit) context options)
         all-rows   (vec (get-in result [:data :rows]))
         truncated? (> (count all-rows) row-limit)
         rows       (cond-> all-rows truncated? (subvec 0 row-limit))]
     {:cols       (get-in result [:data :cols])
      :rows       rows
      :returned   (count rows)
      :truncated? truncated?})))

(defn response-cols
  "The agent-facing description of result `cols`: name, display name, and qualified type names."
  [cols]
  (mapv (fn [{:keys [name base_type effective_type display_name]}]
          (cond-> {:name         name
                   :base_type    (u/qualified-name base_type)
                   :display_name display_name}
            effective_type (assoc :effective_type (u/qualified-name effective_type))))
        cols))
