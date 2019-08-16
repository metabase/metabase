(ns metabase.query-processor
  "Preprocessor that does simple transformations to all incoming queries, simplifing the driver-specific
  implementations."
  (:require [medley.core :as m]
            [metabase
             [config :as config]
             [driver :as driver]]
            [metabase.driver.util :as driver.u]
            [metabase.mbql.schema :as mbql.s]
            [metabase.query-processor
             [debug :as debug]
             [store :as qp.store]]
            [metabase.query-processor.middleware
             [add-dimension-projections :as add-dim]
             [add-implicit-clauses :as implicit-clauses]
             [add-implicit-joins :as add-implicit-joins]
             [add-row-count-and-status :as row-count-and-status]
             [add-settings :as add-settings]
             [add-source-metadata :as add-source-metadata]
             [annotate :as annotate]
             [async :as async]
             [async-wait :as async-wait]
             [auto-bucket-datetimes :as bucket-datetime]
             [bind-effective-timezone :as bind-timezone]
             [binning :as binning]
             [cache :as cache]
             [catch-exceptions :as catch-exceptions]
             [check-features :as check-features]
             [constraints :as constraints]
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
             [pre-alias-aggregations :as pre-alias-ags]
             [process-userland-query :as process-userland-query]
             [reconcile-breakout-and-order-by-bucketing :as reconcile-bucketing]
             [resolve-database :as resolve-database]
             [resolve-driver :as resolve-driver]
             [resolve-fields :as resolve-fields]
             [resolve-joins :as resolve-joins]
             [resolve-source-table :as resolve-source-table]
             [results-metadata :as results-metadata]
             [splice-params-in-response :as splice-params-in-response]
             [store :as store]
             [validate :as validate]
             [wrap-value-literals :as wrap-value-literals]]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s])
  (:import clojure.core.async.impl.channels.ManyToManyChannel))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                QUERY PROCESSOR                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private execute-query
  "The pivotal stage of the `process-query` pipeline where the query is actually executed by the driver's Query
  Processor methods. This function takes the fully pre-processed query, runs it, and returns the results, which then
  run through the various post-processing steps."
  [query :- {:driver   s/Keyword
             s/Keyword s/Any}]
  (driver/execute-query (:driver query) query))

;; The way these functions are applied is actually straight-forward; it matches the middleware pattern used by
;; Ring.
;;
;;    (defn- qp-middleware-fn [qp]
;;      (fn [query]
;;        (do-some-postprocessing (qp (do-some-preprocessing query)))))
;;
;; (For most of the middleware.) We are currently in the process to converting all middleware to an async pattern,
;; which is similar to async Ring, with an added `canceled-chan` param:
;;
;;    (defn- async-qp-middleware-fn [qp]
;;      (fn [query respond raise canceled-chan]
;;        (qp (do-some-preprocessing query)
;;            (fn [results]
;;              (respond (do-some-post-processing results)))
;;            raise
;;            canceled-chan)))
;;
;; `canceled-chan` is a core.async promise channel that will recieve a single message if the connection or thread
;; waiting for the query result is canceled before the QP returns a response; middleware can listen for this message
;; to cancel pending queries if supported by the database. This channel will also close whenever the QP finishes, so
;; you can use it in core.async go blocks to schedule other async actions as well.
;;
;;
;; The majority of middleware functions do only pre-processing, fewer still do only post-processing, and even fewer
;; still do a combination of both. The middleware pattern allows individual pieces of middleware to return closures
;; that maintain some sort of internal state. For example, `cumulative-sum` can determine if it needs to perform
;; cumulative summing, and, if so, modify the query before passing it to QP; once the query is processed, it can use
;; modify the results as needed.
;;
;; PRE-PROCESSING fns are applied from bottom to top, and POST-PROCESSING from top to bottom;
;; the easiest way to wrap your head around this is picturing a the query as a ball being thrown in the air
;; (up through the preprocessing fns, back down through the post-processing ones)
(def ^:private pipeline
  ;; ▼▼▼ POST-PROCESSING ▼▼▼  happens from TOP-TO-BOTTOM, e.g. the results of `f` are (eventually) passed to `limit`
  [#'mbql-to-native/mbql->native
   #'annotate/result-rows-maps->vectors
   #'check-features/check-features
   #'wrap-value-literals/wrap-value-literals
   #'annotate/add-column-info
   #'perms/check-query-permissions
   #'pre-alias-ags/pre-alias-aggregations
   #'cumulative-ags/handle-cumulative-aggregations
   ;; ▲▲▲ NO FK->s POINT ▲▲▲ Everything after this point will not see `:fk->` clauses, only `:joined-field`
   #'resolve-joins/resolve-joins
   #'add-implicit-joins/add-implicit-joins
   #'dev/check-results-format
   #'limit/limit
   #'results-metadata/record-and-return-metadata!
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
   #'row-count-and-status/add-row-count-and-status
   ;; ▼▼▼ RESULTS WRAPPING POINT ▼▼▼ All functions *below* will see results WRAPPED in `:data` during POST-PROCESSING
   ;;
   ;; TODO - I think we should add row count and status much later, perhaps at the very end right before
   ;; `catch-exceptions`
   #'parameters/substitute-parameters
   #'expand-macros/expand-macros
   ;; (drivers can inject custom middleware if they implement `process-query-in-context`)
   #'driver-specific/process-query-in-context
   #'add-settings/add-settings
   #'splice-params-in-response/splice-params-in-response
   ;; ▲▲▲ DRIVER RESOLUTION POINT ▲▲▲
   ;; All functions *above* will have access to the driver during PRE- *and* POST-PROCESSING
   ;;
   ;; TODO - `resolve-driver` and `resolve-database` can be combined into a single step, so we don't need to fetch
   ;; DB twice
   #'resolve-driver/resolve-driver
   #'bind-timezone/bind-effective-timezone
   #'resolve-database/resolve-database
   #'fetch-source-query/resolve-card-id-source-tables
   #'store/initialize-store
   #'log-query/log-query
   ;; ▲▲▲ SYNC MIDDLEWARE ▲▲▲
   ;;
   ;; All middleware above this point is written in the synchronous 1-arg style. All middleware below is written in
   ;; async 4-arg style. Eventually the entire QP middleware stack will be rewritten in the async style. But not yet
   ;;
   ;; TODO - `async-wait` should be moved way up the stack, at least after the DB is resolved, right now for nested
   ;; queries it creates a thread pool for the nested query placeholder DB ID
   ;;
   ;; ▼▼▼ ASYNC MIDDLEWARE ▼▼▼
   #'async/async->sync
   #'async-wait/wait-for-turn
   #'cache/maybe-return-cached-results
   #'validate/validate-query
   #'normalize/normalize
   #'catch-exceptions/catch-exceptions
   #'process-userland-query/process-userland-query
   #'constraints/add-default-userland-constraints
   #'async/async-setup])
;; ▲▲▲ PRE-PROCESSING ▲▲▲ happens from BOTTOM-TO-TOP, e.g. the results of `expand-macros` are passed to
;; `substitute-parameters`

(defn- build-pipeline
  "Construct a new Query Processor pipeline with `f` as the final 'piviotal' function. e.g.:

    All PRE-PROCESSING (query) --> f --> All POST-PROCESSING (result)

  Or another way of looking at it is

    (post-process (f (pre-process query)))

  Normally `f` is something that runs the query, like the `execute-query` function above, but this can be swapped out
  when we want to do things like process a query without actually running it.

  Normally the middleware is combined as if threading the underlying functions thru `->`, e.g.

    ;; with pipeline [#'middleware-1 #'middleware-2]
    (build-pipeline f) ; -> (middleware-2 (middleware-1 f))

  However you can supply a custom `reducing-fn` to build modify various pieces of middleware as needed."
  ([f]
   (build-pipeline f (fn [qp middleware-var]
                       ((var-get middleware-var) qp))))

  ([f reducing-fn]
   (reduce reducing-fn f pipeline)))


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
                  results         (binding [async-wait/*disable-async-wait* true]
                                    (qp (assoc query :results-promise results-promise)))]
              (if (realized? results-promise)
                @results-promise
                ;; if the results promise was never delivered, it means we never made it all the way to the
                ;; `deliver-native-query` portion of the QP pipeline; the results will thus be a failure message from
                ;; our `catch-exceptions` middleware. In 99.9% of cases we probably want to know right away that the
                ;; query failed instead of giving people a failure response and trying to get results from that. So do
                ;; everyone a favor and throw an Exception
                (let [results (m/dissoc-in results [:query :results-promise])]
                  (throw (ex-info (tru "Error preprocessing query") results)))))))]
    (receive-native-query (build-pipeline deliver-native-query))))

(def ^:private ^:dynamic *preprocessing-level* 0)

(def ^:private ^:const max-preprocessing-level 20)

(defn query->preprocessed
  "Return the fully preprocessed form for `query`, the way it would look immediately before `mbql->native` is called.
  Especially helpful for debugging or testing driver QP implementations."
  {:style/indent 0}
  [query]
  ;; record the number of recursive preprocesses taking place to prevent infinite preprocessing loops.
  (binding [*preprocessing-level* (inc *preprocessing-level*)]
    (when (>= *preprocessing-level* max-preprocessing-level)
      (throw (ex-info (str (tru "Infinite loop detected: recursively preprocessed query {0} times."
                                max-preprocessing-level))
               {:type :bug})))
    (-> query        (update :middleware assoc :disable-mbql->native? true)
        (update :preprocessing-level (fnil inc 0))
        preprocess
        (m/dissoc-in [:middleware :disable-mbql->native?]))))

(defn query->expected-cols
  "Return the `:cols` you would normally see in MBQL query results by preprocessing the query amd calling `annotate` on
  it."
  [{query-type :type, :as query}]
  (when-not (= query-type :query)
    (throw (Exception. (tru "Can only determine expected columns for MBQL queries."))))
  (qp.store/with-store
    (let [preprocessed (query->preprocessed query)
          results      ((annotate/add-column-info (constantly nil)) preprocessed)]
      (seq (:cols results)))))

(defn query->native
  "Return the native form for `query` (e.g. for a MBQL query on Postgres this would return a map containing the compiled
  SQL form). (Like `preprocess`, this function will throw an Exception if preprocessing was not successful.)

  (Currently, this function is mostly used by tests and in the REPL; `mbql-to-native/mbql->native` middleware handles
  simliar functionality for queries that are actually executed.)"
  {:style/indent 0}
  [query]
  (perms/check-current-user-has-adhoc-native-query-perms query)
  (let [results (preprocess query)]
    (or (get results :native)
        (throw (ex-info (tru "No native form returned.")
                 (or results {}))))))

(defn query->native-with-spliced-params
  "Return the native form for a `query`, with any prepared statement (or equivalent) parameters spliced into the query
  itself as literals. This is used to power features such as 'Convert this Question to SQL'.

  (Currently, this function is mostly used by tests and in the REPL; `splice-params-in-response` middleware handles
  simliar functionality for queries that are actually executed.)"
  {:style/indent 0}
  [query]
  ;; We need to preprocess the query first to get a valid database in case we're dealing with a nested query whose DB
  ;; ID is the virtual DB identifier
  (let [driver (driver.u/database->driver (:database (query->preprocessed query)))]
    (driver/splice-parameters-into-native-query driver
      (query->native query))))

(def ^:private default-pipeline (build-pipeline execute-query))

(def ^:private debugging-pipeline
  (build-pipeline execute-query debug/debug-middleware))

(def ^:private QueryResponse
  (s/named
   (s/cond-pre
    ManyToManyChannel
    {:status (s/enum :completed :failed :canceled), s/Any s/Any})
   "Valid query response (core.async channel or map with :status)"))

;; QP debugging is only enabled in dev mode
(when config/is-dev?
  (def ^:dynamic *debug*
    "Bind this to `true` to print debugging messages when processing the query."
    false))

(def ^{:style/indent 0, :arglists '([query])} process-query
  "Process an MBQL query. This is the main entrypoint to the magical realm of the Query Processor. Returns a
  core.async channel if option `:async?` is true; otherwise returns results in the usual format. For async queries, if
  the core.async channel is closed, the query will be canceled."
  (if config/is-dev?
    (s/fn :- QueryResponse
      [query]
      ((if *debug*
         debugging-pipeline
         default-pipeline) query))
    default-pipeline))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Userland Queries (Public Interface)                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The difference between `process-query` and the versions below is that the ones below are meant to power various
;; things like API endpoints and pulses, while `process-query` is more of a low-level internal function.
;;
;; Many moons ago the two sets of functions had different QP pipelines; these days the functions below are simply
;; convenience wrappers for `process-query` that include a few options to activate appropriate middleware for userland
;; queries. This middleware does things like saving QueryExecutions and adding max results constraints.

(s/defn process-query-and-save-execution!
  "Process and run a 'userland' MBQL query (e.g. one ran as the result of an API call, scheduled Pulse, MetaBot query,
  etc.). Returns results in a format appropriate for consumption by FE client. Saves QueryExecution row in application
  DB."
  {:style/indent 1}
  [query, options :- mbql.s/Info]
  (process-query
    (-> query
        (update :info merge options)
        (assoc-in [:middleware :userland-query?] true))))

(s/defn process-query-and-save-with-max-results-constraints!
  "Same as `process-query-and-save-execution!` but will include the default max rows returned as a constraint. (This
  function is ulitmately what powers most API endpoints that run queries, including `POST /api/dataset`.)"
  {:style/indent 1}
  [query, options :- mbql.s/Info]
  (let [query (assoc-in query [:middleware :add-default-userland-constraints?] true)]
    (process-query-and-save-execution! query options)))
