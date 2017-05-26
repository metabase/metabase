(ns metabase.query-processor
  "Preprocessor that does simple transformations to all incoming queries, simplifing the driver-specific implementations."
  (:require [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.models
             [query :as query]
             [query-execution :as query-execution :refer [QueryExecution]]]
            [metabase.query-processor.middleware
             [add-implicit-clauses :as implicit-clauses]
             [add-row-count-and-status :as row-count-and-status]
             [add-settings :as add-settings]
             [annotate-and-sort :as annotate-and-sort]
             [cache :as cache]
             [catch-exceptions :as catch-exceptions]
             [cumulative-aggregations :as cumulative-ags]
             [dev :as dev]
             [driver-specific :as driver-specific]
             [expand-macros :as expand-macros]
             [expand-resolve :as expand-resolve]
             [format-rows :as format-rows]
             [limit :as limit]
             [log :as log-query]
             [mbql-to-native :as mbql-to-native]
             [parameters :as parameters]
             [permissions :as perms]
             [resolve-driver :as resolve-driver]]
            [metabase.query-processor.util :as qputil]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           QUERY PROCESSOR                                             |
;;; +-------------------------------------------------------------------------------------------------------+

(defn- execute-query
  "The pivotal stage of the `process-query` pipeline where the query is actually executed by the driver's Query Processor methods.
   This function takes the fully pre-processed query, runs it, and returns the results, which then run through the various
   post-processing steps."
  [query]
  {:pre [(map? query) (:driver query)]}
  (driver/execute-query (:driver query) query))

;; The way these functions are applied is actually straight-forward; it matches the middleware pattern used by Compojure.
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
;; Many functions do both pre and post-processing; this middleware pattern allows them to return closures that maintain some sort of
;; internal state. For example, `cumulative-sum` can determine if it needs to perform cumulative summing, and, if so, modify the query
;; before passing it to QP; once the query is processed, it can use modify the results as needed.
;;
;; PRE-PROCESSING fns are applied from bottom to top, and POST-PROCESSING from top to bottom;
;; the easiest way to wrap your head around this is picturing a the query as a ball being thrown in the air
;; (up through the preprocessing fns, back down through the post-processing ones)
(defn process-query
  "A pipeline of various QP functions (including middleware) that are used to process MB queries."
  {:style/indent 0}
  [query]
  ;; ▼▼▼ POST-PROCESSING ▼▼▼  happens from TOP-TO-BOTTOM, e.g. the results of `run-query` are (eventually) passed to `limit`
  ((-> execute-query
       dev/guard-multiple-calls
       mbql-to-native/mbql->native                   ; ▲▲▲ NATIVE-ONLY POINT ▲▲▲ Query converted from MBQL to native here; all functions *above* will only see the native query
       annotate-and-sort/annotate-and-sort
       perms/check-query-permissions
       log-query/log-expanded-query
       dev/check-results-format
       limit/limit
       cumulative-ags/handle-cumulative-aggregations
       implicit-clauses/add-implicit-clauses
       format-rows/format-rows
       expand-resolve/expand-resolve                 ; ▲▲▲ QUERY EXPANSION POINT  ▲▲▲ All functions *above* will see EXPANDED query during PRE-PROCESSING
       row-count-and-status/add-row-count-and-status ; ▼▼▼ RESULTS WRAPPING POINT ▼▼▼ All functions *below* will see results WRAPPED in `:data` during POST-PROCESSING
       parameters/substitute-parameters
       expand-macros/expand-macros
       driver-specific/process-query-in-context      ; (drivers can inject custom middleware if they implement IDriver's `process-query-in-context`)
       add-settings/add-settings
       resolve-driver/resolve-driver                 ; ▲▲▲ DRIVER RESOLUTION POINT ▲▲▲ All functions *above* will have access to the driver during PRE- *and* POST-PROCESSING
       log-query/log-initial-query
       cache/maybe-return-cached-results
       catch-exceptions/catch-exceptions)
   query))
;; ▲▲▲ PRE-PROCESSING ▲▲▲ happens from BOTTOM-TO-TOP, e.g. the results of `expand-macros` are (eventually) passed to `expand-resolve`


(def ^{:arglists '([query])} expand
  "Expand a QUERY the same way it would normally be done as part of query processing.
   This is useful for things that need to look at an expanded query, such as permissions checking for Cards."
  (->> identity
       expand-resolve/expand-resolve
       parameters/substitute-parameters
       expand-macros/expand-macros))
;; ▲▲▲ This only does PRE-PROCESSING, so it happens from bottom to top, eventually returning the preprocessed query instead of running it


;;; +----------------------------------------------------------------------------------------------------+
;;; |                                     DATASET-QUERY PUBLIC API                                       |
;;; +----------------------------------------------------------------------------------------------------+

(defn- save-query-execution!
  "Save a `QueryExecution` and update the average execution time for the corresponding `Query`."
  [query-execution]
  (u/prog1 query-execution
    (query/update-average-execution-time! (:hash query-execution) (:running_time query-execution))
    (db/insert! QueryExecution (dissoc query-execution :json_query))))

(defn- save-and-return-failed-query!
  "Save QueryExecution state and construct a failed query response"
  [query-execution error-message]
  ;; record our query execution and format response
  (-> query-execution
      (dissoc :start_time_millis)
      (merge {:error        error-message
              :running_time (- (System/currentTimeMillis) (:start_time_millis query-execution))})
      save-query-execution!
      (dissoc :result_rows :hash :executor_id :native :card_id :dashboard_id :pulse_id)
      ;; this is just for the response for client
      (assoc :status    :failed
             :error     error-message
             :row_count 0
             :data      {:rows    []
                         :cols    []
                         :columns []})))

(defn- save-and-return-successful-query!
  "Save QueryExecution state and construct a completed (successful) query response"
  [query-execution query-result]
  (let [query-execution (-> (assoc query-execution
                              :running_time (- (System/currentTimeMillis)
                                               (:start_time_millis query-execution))
                              :result_rows  (get query-result :row_count 0))
                            (dissoc :start_time_millis))]
    ;; only insert a new record into QueryExecution if the results *were not* cached (i.e., only if a Query was actually ran)
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
    (throw (Exception. "invalid response from database driver. no :status provided")))
  (when (= :failed (:status query-result))
    (log/warn (u/pprint-to-str 'red query-result))
    (throw (Exception. (str (get query-result :error "general error"))))))

(def ^:dynamic ^Boolean *allow-queries-with-no-executor-id*
  "Should we allow running queries (via `dataset-query`) without specifying the `executed-by` User ID?
   By default this is `false`, but this constraint can be disabled for running queries not executed by a specific user
   (e.g., public Cards)."
  false)

(defn- query-execution-info
  "Return the info for the `QueryExecution` entry for this QUERY."
  [{{:keys [executed-by query-hash query-type context card-id dashboard-id pulse-id]} :info, :as query}]
  {:pre [(instance? (Class/forName "[B") query-hash)
         (string? query-type)]}
  {:executor_id       executed-by
   :card_id           card-id
   :dashboard_id      dashboard-id
   :pulse_id          pulse-id
   :context           context
   :hash              (or query-hash (throw (Exception. "Missing query hash!")))
   :native            (= query-type "native")
   :json_query        (dissoc query :info)
   :started_at        (u/new-sql-timestamp)
   :running_time      0
   :result_rows       0
   :start_time_millis (System/currentTimeMillis)})

(defn- run-and-save-query!
  "Run QUERY and save appropriate `QueryExecution` info, and then return results (or an error message) in the usual format."
  [query]
  (let [query-execution (query-execution-info query)]
    (try
      (let [result (process-query query)]
        (assert-query-status-successful result)
        (save-and-return-successful-query! query-execution result))
      (catch Throwable e
        (log/warn (u/format-color 'red "Query failure: %s\n%s" (.getMessage e) (u/pprint-to-str (u/filtered-stacktrace e))))
        (save-and-return-failed-query! query-execution (.getMessage e))))))

(def ^:private DatasetQueryOptions
  "Schema for the options map for the `dataset-query` function."
  (s/constrained {:context                       query-execution/Context
                  (s/optional-key :executed-by)  (s/maybe su/IntGreaterThanZero)
                  (s/optional-key :card-id)      (s/maybe su/IntGreaterThanZero)
                  (s/optional-key :dashboard-id) (s/maybe su/IntGreaterThanZero)
                  (s/optional-key :pulse-id)     (s/maybe su/IntGreaterThanZero)}
                 (fn [{:keys [executed-by]}]
                   (or (integer? executed-by)
                       *allow-queries-with-no-executor-id*))
                 "executed-by cannot be nil unless *allow-queries-with-no-executor-id* is true"))

(s/defn ^:always-validate dataset-query
  "Process and run a json based dataset query and return results.

  Takes 2 arguments:

  1.  the json query as a map
  2.  query execution options (and context information) specified as a map

  Depending on the database specified in the query this function will delegate to a driver specific implementation.
  For the purposes of tracking we record each call to this function as a QueryExecution in the database.

  OPTIONS must conform to the `DatasetQueryOptions` schema; refer to that for more details."
  {:style/indent 1}
  [query, options :- DatasetQueryOptions]
  (run-and-save-query! (assoc query :info (assoc options
                                            :query-hash (qputil/query-hash query)
                                            :query-type (if (qputil/mbql-query? query) "MBQL" "native")))))
