(ns metabase.query-processor
  "Preprocessor that does simple transformations to all incoming queries, simplifing the driver-specific
  implementations."
  (:require [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models
             [query :as query]
             [query-execution :as query-execution :refer [QueryExecution]]]
            [metabase.query-processor.middleware
             [add-dimension-projections :as add-dim]
             [add-implicit-clauses :as implicit-clauses]
             [add-query-throttle :as query-throttle]
             [add-row-count-and-status :as row-count-and-status]
             [add-settings :as add-settings]
             [annotate :as annotate]
             [auto-bucket-datetime-breakouts :as bucket-datetime]
             [bind-effective-timezone :as bind-timezone]
             [binning :as binning]
             [cache :as cache]
             [catch-exceptions :as catch-exceptions]
             [check-features :as check-features]
             [cumulative-aggregations :as cumulative-ags]
             [desugar :as desugar]
             [dev :as dev]
             [driver-specific :as driver-specific]
             [expand-macros :as expand-macros]
             [fetch-source-query :as fetch-source-query]
             [format-rows :as format-rows]
             [limit :as limit]
             [log :as log-query]
             [mbql-to-native :as mbql-to-native]
             [normalize-query :as normalize]
             [parameters :as parameters]
             [permissions :as perms]
             [reconcile-breakout-and-order-by-bucketing :as reconcile-bucketing]
             [resolve-database :as resolve-database]
             [resolve-driver :as resolve-driver]
             [resolve-fields :as resolve-fields]
             [resolve-joined-tables :as resolve-joined-tables]
             [resolve-source-table :as resolve-source-table]
             [results-metadata :as results-metadata]
             [store :as store]
             [validate :as validate]
             [wrap-value-literals :as wrap-value-literals]]
            [metabase.query-processor.util :as qputil]
            [metabase.util
             [date :as du]
             [i18n :refer [tru]]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                QUERY PROCESSOR                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- execute-query
  "The pivotal stage of the `process-query` pipeline where the query is actually executed by the driver's Query
  Processor methods. This function takes the fully pre-processed query, runs it, and returns the results, which then
  run through the various post-processing steps."
  [query]
  {:pre [(map? query) (:driver query)]}
  (driver/execute-query (:driver query) query))

;; The way these functions are applied is actually straight-forward; it matches the middleware pattern used by
;; Compojure.
;;
;; (defn- qp-middleware-fn [qp]
;;   (fn [query]
;;     (do-some-postprocessing (qp (do-some-preprocessing query)))))
;;
;; Each query processor function is passed a single arg, QP, and returns a function that accepts a single arg, QUERY.
;;
;; This returned function *pre-processes* QUERY as needed, and then passes it to QP.
;; The function may then *post-process* the results of (QP QUERY) as neeeded, and returns the results.
;;
;; Many functions do both pre and post-processing; this middleware pattern allows them to return closures that
;; maintain some sort of internal state. For example, `cumulative-sum` can determine if it needs to perform cumulative
;; summing, and, if so, modify the query before passing it to QP; once the query is processed, it can use modify the
;; results as needed.
;;
;; PRE-PROCESSING fns are applied from bottom to top, and POST-PROCESSING from top to bottom;
;; the easiest way to wrap your head around this is picturing a the query as a ball being thrown in the air
;; (up through the preprocessing fns, back down through the post-processing ones)
(defn- qp-pipeline
  "Construct a new Query Processor pipeline with F as the final 'piviotal' function. e.g.:

     All PRE-PROCESSING (query) --> F --> All POST-PROCESSING (result)

   Or another way of looking at it is

     (post-process (f (pre-process query)))

   Normally F is something that runs the query, like the `execute-query` function above, but this can be swapped out
   when we want to do things like process a query without actually running it."
  [f]
  ;; ▼▼▼ POST-PROCESSING ▼▼▼  happens from TOP-TO-BOTTOM, e.g. the results of `f` are (eventually) passed to `limit`
  (-> f
      ;; ▲▲▲ NATIVE-ONLY POINT ▲▲▲ Query converted from MBQL to native here; f will see a native query instead of MBQL
      mbql-to-native/mbql->native
      ;; TODO - should we log the fully preprocessed query here?
      check-features/check-features
      wrap-value-literals/wrap-value-literals
      annotate/add-column-info
      perms/check-query-permissions
      cumulative-ags/handle-cumulative-aggregations
      resolve-joined-tables/resolve-joined-tables
      dev/check-results-format
      limit/limit
      results-metadata/record-and-return-metadata!
      format-rows/format-rows
      desugar/desugar
      binning/update-binning-strategy
      resolve-fields/resolve-fields
      add-dim/add-remapping
      implicit-clauses/add-implicit-clauses
      reconcile-bucketing/reconcile-breakout-and-order-by-bucketing
      bucket-datetime/auto-bucket-datetime-breakouts
      resolve-source-table/resolve-source-table
      row-count-and-status/add-row-count-and-status
      ;; ▼▼▼ RESULTS WRAPPING POINT ▼▼▼ All functions *below* will see results WRAPPED in `:data` during POST-PROCESSING
      ;;
      ;; TODO - I think we should add row count and status much later, perhaps at the very end right before
      ;; `catch-exceptions`
      parameters/substitute-parameters
      expand-macros/expand-macros
      ;; (drivers can inject custom middleware if they implement IDriver's `process-query-in-context`)
      driver-specific/process-query-in-context
      add-settings/add-settings
      ;; ▲▲▲ DRIVER RESOLUTION POINT ▲▲▲
      ;; All functions *above* will have access to the driver during PRE- *and* POST-PROCESSING
      ;; TODO - I think we should do this much earlier
      resolve-driver/resolve-driver
      bind-timezone/bind-effective-timezone
      resolve-database/resolve-database
      fetch-source-query/fetch-source-query
      store/initialize-store
      query-throttle/maybe-add-query-throttle
      log-query/log-initial-query
      ;; TODO - bind `*query*` here ?
      cache/maybe-return-cached-results
      log-query/log-results-metadata
      validate/validate-query
      normalize/normalize
      catch-exceptions/catch-exceptions))
;; ▲▲▲ PRE-PROCESSING ▲▲▲ happens from BOTTOM-TO-TOP, e.g. the results of `expand-macros` are passed to
;; `substitute-parameters`

(def ^:private ^{:arglists '([query])} preprocess
  "Run all the preprocessing steps on a query, returning it in the shape it looks immediately before it would normally
  get executed by `execute-query`. One important thing to note: if preprocessing fails for some reason, `preprocess`
  will throw an Exception, unlike `process-query`. Why? Preprocessing is something we use internally, so wrapping
  catching Exceptions and wrapping them in frontend results format doesn't make sense.

  (NOTE: Don't use this directly. You either want `query->preprocessed` (for the fully preprocessed query) or
  `query->native` for the native form.)"
  ;; throwing pre-allocated exceptions can actually get optimized away into long jumps by the JVM, let's give it a
  ;; chance to happen here
  (let [quit-early-exception (Exception.)
        ;; the 'pivoting' function is just one that delivers the query in its current state into the promise we
        ;; conveniently attached to the query. Then it quits early by throwing our pre-allocated Exception...
        deliver-native-query
        (fn [{:keys [results-promise] :as query}]
          (deliver results-promise (dissoc query :results-promise))
          (throw quit-early-exception))

        ;; ...which ends up getting caught by the `catch-exceptions` middleware. Add a final post-processing function
        ;; around that which will return whatever we delivered into the `:results-promise`.
        receive-native-query
        (fn [qp]
          (fn [query]
            (let [results-promise (promise)
                  results         (qp (assoc query :results-promise results-promise))]
              (if (realized? results-promise)
                @results-promise
                ;; if the results promise was never delivered, it means we never made it all the way to the
                ;; `deliver-native-query` portion of the QP pipeline; the results will thus be a failure message from
                ;; our `catch-exceptions` middleware. In 99.9% of cases we probably want to know right away that the
                ;; query failed instead of giving people a failure response and trying to get results from that. So do
                ;; everyone a favor and throw an Exception
                (let [results (m/dissoc-in results [:query :results-promise])]
                  (throw (ex-info (str (tru "Error preprocessing query")) results)))))))]
    (receive-native-query (qp-pipeline deliver-native-query))))

(defn query->preprocessed
  "Return the fully preprocessed form for `query`, the way it would look immediately before `mbql->native` is called.
  Especially helpful for debugging or testing driver QP implementations."
  {:style/indent 0}
  [query]
  (-> (update query :middleware assoc :disable-mbql->native? true)
      preprocess
      (m/dissoc-in [:middleware :disable-mbql->native?])))

(defn query->native
  "Return the native form for QUERY (e.g. for a MBQL query on Postgres this would return a map containing the compiled
  SQL form). (Like `preprocess`, this function will throw an Exception if preprocessing was not successful.)"
  {:style/indent 0}
  [query]
  (let [results (preprocess query)]
    (or (get results :native)
        (throw (ex-info (str (tru "No native form returned."))
                 (or results {}))))))

(def ^:private default-pipeline (qp-pipeline execute-query))

(defn process-query
  "A pipeline of various QP functions (including middleware) that are used to process MB queries."
  {:style/indent 0}
  [query]
  (default-pipeline query))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            DATASET-QUERY PUBLIC API                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The only difference between `process-query` and `process-query-and-save-execution!` (below) is that the
;; latter records a `QueryExecution` (inserts a new row) recording some stats about this Query run including
;; execution time and type of query ran
;;
;; `process-query-and-save-execution!` is the function used by various things like API endpoints and pulses;
;; `process-query` is more of an internal function

(defn- save-query-execution!
  "Save a `QueryExecution` and update the average execution time for the corresponding `Query`."
  [{query :json_query, :as query-execution}]
  (u/prog1 query-execution
    (query/save-query-and-update-average-execution-time! query (:hash query-execution) (:running_time query-execution))
    (db/insert! QueryExecution (dissoc query-execution :json_query))))

(defn- save-and-return-failed-query!
  "Save QueryExecution state and construct a failed query response"
  [query-execution, ^Throwable e]
  ;; record our query execution and format response
  (-> query-execution
      (dissoc :start_time_millis)
      (merge {:error        (.getMessage e)
              :running_time (- (System/currentTimeMillis) (:start_time_millis query-execution))})
      save-query-execution!
      (dissoc :result_rows :hash :executor_id :native :card_id :dashboard_id :pulse_id)
      ;; this is just for the response for client
      (assoc :status    :failed
             :error     (.getMessage e)
             :row_count 0
             :data      {:rows    []
                         :cols    []
                         :columns []})
      ;; include stacktrace and preprocessed/native stages of the query if available in the response which should make
      ;; debugging queries a bit easier
      (merge (some-> (ex-data e)
                     (select-keys [:stacktrace :preprocessed :native])
                     (m/dissoc-in [:preprocessed :info])))))

(defn- save-and-return-successful-query!
  "Save QueryExecution state and construct a completed (successful) query response"
  [query-execution query-result]
  (let [query-execution (-> (assoc query-execution
                              :running_time (- (System/currentTimeMillis)
                                               (:start_time_millis query-execution))
                              :result_rows  (get query-result :row_count 0))
                            (dissoc :start_time_millis))]
    ;; only insert a new record into QueryExecution if the results *were not* cached (i.e., only if a Query was
    ;; actually ran)
    (when-not (:cached query-result)
      (save-query-execution! query-execution))
    ;; ok, now return the results in the normal response format
    (merge (dissoc query-execution :error :result_rows :hash :executor_id :native :card_id :dashboard_id :pulse_id)
           query-result
           {:status                 :completed
            :average_execution_time (when (:cached query-result)
                                      (query/average-execution-time-ms (:hash query-execution)))})))


(defn- assert-query-status-successful
  "Make sure QUERY-RESULT `:status` is something other than `nil`or `:failed`, or throw an Exception."
  [query-result]
  (when-not (contains? query-result :status)
    (throw (ex-info (str (tru "Invalid response from database driver. No :status provided."))
             query-result)))
  (when (= :failed (:status query-result))
    (log/warn (u/pprint-to-str 'red query-result))
    (throw (ex-info (str (get query-result :error (tru "General error")))
             query-result))))

(def ^:dynamic ^Boolean *allow-queries-with-no-executor-id*
  "Should we allow running queries (via `dataset-query`) without specifying the `executed-by` User ID?  By default
  this is `false`, but this constraint can be disabled for running queries not executed by a specific user
  (e.g., public Cards)."
  false)

(defn- query-execution-info
  "Return the info for the `QueryExecution` entry for this QUERY."
  {:arglists '([query])}
  [{{:keys [executed-by query-hash query-type context card-id dashboard-id pulse-id]} :info
    database-id                                                                       :database
    :as                                                                               query}]
  {:pre [(instance? (Class/forName "[B") query-hash)
         (string? query-type)]}
  {:database_id       database-id
   :executor_id       executed-by
   :card_id           card-id
   :dashboard_id      dashboard-id
   :pulse_id          pulse-id
   :context           context
   :hash              (or query-hash (throw (Exception. (str (tru "Missing query hash!")))))
   :native            (= query-type "native")
   :json_query        (dissoc query :info)
   :started_at        (du/new-sql-timestamp)
   :running_time      0
   :result_rows       0
   :start_time_millis (System/currentTimeMillis)})

(defn- run-and-save-query!
  "Run QUERY and save appropriate `QueryExecution` info, and then return results (or an error message) in the usual
  format."
  [query]
  (let [query-execution (query-execution-info query)]
    (try
      (let [result (process-query query)]
        (assert-query-status-successful result)
        (save-and-return-successful-query! query-execution result))
      (catch Throwable e
        (if (= (:type (ex-data e)) ::query-throttle/concurrent-query-limit-reached)
          (throw e)
          (do
            (log/warn (u/format-color 'red "Query failure: %s\n%s"
                                      (.getMessage e)
                                      (u/pprint-to-str (u/filtered-stacktrace e))))
            (save-and-return-failed-query! query-execution e)))))))

(s/defn ^:private assoc-query-info [query, options :- mbql.s/Info]
  (assoc query :info (assoc options
                       :query-hash (qputil/query-hash query)
                       :query-type (if (qputil/mbql-query? query) "MBQL" "native"))))

;; TODO - couldn't saving the query execution be done by MIDDLEWARE?
(s/defn process-query-and-save-execution!
  "Process and run a json based dataset query and return results.

  Takes 2 arguments:

  1.  the json query as a map
  2.  query execution options (and context information) specified as a map

  Depending on the database specified in the query this function will delegate to a driver specific implementation.
  For the purposes of tracking we record each call to this function as a QueryExecution in the database.

  OPTIONS must conform to the `mbql.s/Info` schema; refer to that for more details."
  {:style/indent 1}
  [query, options :- mbql.s/Info]
  (run-and-save-query! (assoc-query-info query options)))

(def ^:private ^:const max-results-bare-rows
  "Maximum number of rows to return specifically on :rows type queries via the API."
  2000)

(def ^:private ^:const max-results
  "General maximum number of rows to return from an API query."
  10000)

(def default-query-constraints
  "Default map of constraints that we apply on dataset queries executed by the api."
  {:max-results           max-results
   :max-results-bare-rows max-results-bare-rows})

(s/defn process-query-and-save-with-max!
  "Same as `process-query-and-save-execution!` but will include the default max rows returned as a constraint"
  {:style/indent 1}
  [query, options :- mbql.s/Info]
  (process-query-and-save-execution! (assoc query :constraints default-query-constraints) options))

(s/defn process-query-without-save!
  "Invokes `process-query` with info needed for the included remark."
  [user query]
  (process-query (assoc-query-info query {:executed-by user})))
