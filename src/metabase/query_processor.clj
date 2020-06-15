(ns metabase.query-processor
  "The main entrypoint to running queries."
  (:require [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [driver :as driver]]
            [metabase.driver.util :as driver.u]
            [metabase.query-processor
             [context :as context]
             [error-type :as error-type]
             [reducible :as qp.reducible]
             [store :as qp.store]]
            [metabase.query-processor.middleware
             [add-dimension-projections :as add-dim]
             [add-implicit-clauses :as implicit-clauses]
             [add-implicit-joins :as add-implicit-joins]
             [add-rows-truncated :as add-rows-truncated]
             [add-source-metadata :as add-source-metadata]
             [add-timezone-info :as add-timezone-info]
             [annotate :as annotate]
             [auto-bucket-datetimes :as bucket-datetime]
             [binning :as binning]
             [cache :as cache]
             [catch-exceptions :as catch-exceptions]
             [check-features :as check-features]
             [constraints :as constraints]
             [cumulative-aggregations :as cumulative-ags]
             [desugar :as desugar]
             [expand-macros :as expand-macros]
             [fetch-source-query :as fetch-source-query]
             [format-rows :as format-rows]
             [limit :as limit]
             [mbql-to-native :as mbql-to-native]
             [normalize-query :as normalize]
             [optimize-datetime-filters :as optimize-datetime-filters]
             [parameters :as parameters]
             [permissions :as perms]
             [pre-alias-aggregations :as pre-alias-ags]
             [process-userland-query :as process-userland-query]
             [reconcile-breakout-and-order-by-bucketing :as reconcile-bucketing]
             [resolve-database-and-driver :as resolve-database-and-driver]
             [resolve-fields :as resolve-fields]
             [resolve-joins :as resolve-joins]
             [resolve-referenced :as resolve-referenced]
             [resolve-source-table :as resolve-source-table]
             [results-metadata :as results-metadata]
             [splice-params-in-response :as splice-params-in-response]
             [store :as store]
             [validate :as validate]
             [wrap-value-literals :as wrap-value-literals]]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                QUERY PROCESSOR                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; ▼▼▼ POST-PROCESSING ▼▼▼  happens from TOP-TO-BOTTOM, e.g. the results of `f` are (eventually) passed to `limit`
(def default-middleware
  "The default set of middleware applied to queries ran via `process-query`."
  [#'mbql-to-native/mbql->native
   #'check-features/check-features
   #'optimize-datetime-filters/optimize-datetime-filters
   #'wrap-value-literals/wrap-value-literals
   #'annotate/add-column-info
   #'perms/check-query-permissions
   #'pre-alias-ags/pre-alias-aggregations
   #'cumulative-ags/handle-cumulative-aggregations
   #'resolve-joins/resolve-joins
   #'add-implicit-joins/add-implicit-joins
   #'limit/limit
   #'format-rows/format-rows
   #'desugar/desugar
   #'binning/update-binning-strategy
   #'resolve-fields/resolve-fields
   #'add-dim/add-remapping
   #'implicit-clauses/add-implicit-clauses
   #'add-source-metadata/add-source-metadata-for-source-queries
   #'reconcile-bucketing/reconcile-breakout-and-order-by-bucketing
   #'bucket-datetime/auto-bucket-datetimes
   #'resolve-source-table/resolve-source-tables
   #'parameters/substitute-parameters
   #'resolve-referenced/resolve-referenced-card-resources
   #'expand-macros/expand-macros
   #'add-timezone-info/add-timezone-info
   #'splice-params-in-response/splice-params-in-response
   #'resolve-database-and-driver/resolve-database-and-driver
   #'fetch-source-query/resolve-card-id-source-tables
   #'store/initialize-store
   #'cache/maybe-return-cached-results
   #'validate/validate-query
   #'normalize/normalize
   #'add-rows-truncated/add-rows-truncated
   #'results-metadata/record-and-return-metadata!])
;; ▲▲▲ PRE-PROCESSING ▲▲▲ happens from BOTTOM-TO-TOP, e.g. the results of `expand-macros` are passed to
;; `substitute-parameters`

;; In REPL-based dev rebuild the QP every time it is called; this way we don't need to reload this namespace when
;; middleware is changed. Outside of dev only build the QP once for performance/locality
(defn- base-qp [middleware]
  (letfn [(qp []
            (qp.reducible/async-qp (qp.reducible/combine-middleware middleware)))]
    (if config/is-dev?
      (fn [& args]
        (apply (qp) args))
      (qp))))

(def ^{:arglists '([query] [query context])} process-query-async
  "Process a query asynchronously, returning a `core.async` channel that is called with the final result (or Throwable)."
  (base-qp default-middleware))

(def ^{:arglists '([query] [query context])} process-query-sync
  "Process a query synchronously, blocking until results are returned. Throws raised Exceptions directly."
  (qp.reducible/sync-qp process-query-async))

(defn process-query
  "Process an MBQL query. This is the main entrypoint to the magical realm of the Query Processor. Returns a *single*
  core.async channel if option `:async?` is true; otherwise returns results in the usual format. For async queries, if
  the core.async channel is closed, the query will be canceled."
  {:arglists '([query] [query context])}
  [{:keys [async?], :as query} & args]
  (apply (if async? process-query-async process-query-sync)
         query
         args))

(def ^:private ^:dynamic *preprocessing-level* 1)

(def ^:private ^:const max-preprocessing-level 20)

(def ^:private ^:const preprocessing-timeout-ms 10000)

(defn- preprocess-query [query context]
  (binding [*preprocessing-level* (inc *preprocessing-level*)]
    ;; record the number of recursive preprocesses taking place to prevent infinite preprocessing loops.
    (log/tracef "*preprocessing-level*: %d" *preprocessing-level*)
    (when (>= *preprocessing-level* max-preprocessing-level)
      (throw (ex-info (str (tru "Infinite loop detected: recursively preprocessed query {0} times."
                                max-preprocessing-level))
               {:type error-type/qp})))
    (process-query-sync query context)))

(defn query->preprocessed
  "Return the fully preprocessed form for `query`, the way it would look immediately before `mbql->native` is called.
  Especially helpful for debugging or testing driver QP implementations."
  [query]
  (preprocess-query query {:preprocessedf
                           (fn [query context]
                             (context/raisef (qp.reducible/quit query) context))}))

(defn query->expected-cols
  "Return the `:cols` you would normally see in MBQL query results by preprocessing the query and calling `annotate` on
  it. This only works for pure MBQL queries, since it does not actually run the queries. Native queries or MBQL
  queries with native source queries won't work, since we don't need the results."
  [{query-type :type, :as query}]
  (when-not (= query-type :query)
    (throw (ex-info (tru "Can only determine expected columns for MBQL queries.")
             {:type error-type/qp})))
  ;; TODO - we should throw an Exception if the query has a native source query or at least warn about it. Need to
  ;; check where this is used.
  (qp.store/with-store
    (let [preprocessed (query->preprocessed query)]
      (driver/with-driver (driver.u/database->driver (:database preprocessed))
        (seq (annotate/merged-column-info preprocessed nil))))))

(defn query->native
  "Return the native form for `query` (e.g. for a MBQL query on Postgres this would return a map containing the compiled
  SQL form). Like `preprocess`, this function will throw an Exception if preprocessing was not successful."
  [query]
  (preprocess-query query {:nativef
                           (fn [query context]
                             (context/raisef (qp.reducible/quit query) context))}))

(defn query->native-with-spliced-params
  "Return the native form for a `query`, with any prepared statement (or equivalent) parameters spliced into the query
  itself as literals. This is used to power features such as 'Convert this Question to SQL'.
  (Currently, this function is mostly used by tests and in the REPL; `splice-params-in-response` middleware handles
  simliar functionality for queries that are actually executed.)"
  [query]
  ;; We need to preprocess the query first to get a valid database in case we're dealing with a nested query whose DB
  ;; ID is the virtual DB identifier
  (let [driver (driver.u/database->driver (:database (query->preprocessed query)))]
    (driver/splice-parameters-into-native-query driver (query->native query))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Userland Queries (Public Interface)                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The difference between `process-query` and the versions below is that the ones below are meant to power various
;; things like API endpoints and pulses, while `process-query` is more of a low-level internal function.
;;
(def userland-middleware
  "The default set of middleware applied to 'userland' queries ran via `process-query-and-save-execution!` (i.e., via
  the REST API)."
  (concat
   default-middleware
   [#'constraints/add-default-userland-constraints
    #'process-userland-query/process-userland-query
    #'catch-exceptions/catch-exceptions]))

(def ^{:arglists '([query] [query context])} process-userland-query-async
  "Like `process-query-async`, but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
  (base-qp userland-middleware))

(def ^{:arglists '([query] [query context])} process-userland-query-sync
  "Like `process-query-sync`, but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
  (qp.reducible/sync-qp process-userland-query-async))

(defn process-userland-query
  "Like `process-query`, but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
  {:arglists '([query] [query context])}
  [{:keys [async?], :as query} & args]
  (apply (if async? process-userland-query-async process-userland-query-sync)
         query
         args))

(s/defn process-query-and-save-execution!
  "Process and run a 'userland' MBQL query (e.g. one ran as the result of an API call, scheduled Pulse, MetaBot query,
  etc.). Returns results in a format appropriate for consumption by FE client. Saves QueryExecution row in application
  DB."
  ([query info]
   (process-userland-query (assoc query :info info)))

  ([query info context]
   (process-userland-query (assoc query :info info) context)))

(defn- add-default-constraints [query]
  (assoc-in query [:middleware :add-default-userland-constraints?] true))

(s/defn process-query-and-save-with-max-results-constraints!
  "Same as `process-query-and-save-execution!` but will include the default max rows returned as a constraint. (This
  function is ulitmately what powers most API endpoints that run queries, including `POST /api/dataset`.)"
  ([query info]
   (process-query-and-save-execution! (add-default-constraints query) info))

  ([query info context]
   (process-query-and-save-execution! (add-default-constraints query) info context)))
