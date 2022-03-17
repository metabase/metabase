(ns metabase.query-processor
  "Primary entrypoints to running Metabase (MBQL) queries.

    (metabase.query-processor/process-query {:type :query, :database 1, :query {:source-table 2}})

  Various REST API endpoints, such as `POST /api/dataset`, return the results of queries; calling one variations of
  `process-userland-query` (see documentation below)."
  (:refer-clojure :exclude [compile])
  (:require [metabase.config :as config]
            [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.mbql.util :as mbql.u]
            [metabase.plugins.classloader :as classloader]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.middleware.add-default-temporal-unit :as add-default-temporal-unit]
            [metabase.query-processor.middleware.add-dimension-projections :as add-dim]
            [metabase.query-processor.middleware.add-implicit-clauses :as implicit-clauses]
            [metabase.query-processor.middleware.add-implicit-joins :as add-implicit-joins]
            [metabase.query-processor.middleware.add-rows-truncated :as add-rows-truncated]
            [metabase.query-processor.middleware.add-source-metadata :as add-source-metadata]
            [metabase.query-processor.middleware.add-timezone-info :as add-timezone-info]
            [metabase.query-processor.middleware.annotate :as annotate]
            [metabase.query-processor.middleware.auto-bucket-datetimes :as bucket-datetime]
            [metabase.query-processor.middleware.auto-parse-filter-values :as auto-parse-filter-values]
            [metabase.query-processor.middleware.binning :as binning]
            [metabase.query-processor.middleware.cache :as cache]
            [metabase.query-processor.middleware.catch-exceptions :as catch-exceptions]
            [metabase.query-processor.middleware.check-features :as check-features]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.query-processor.middleware.cumulative-aggregations :as cumulative-ags]
            [metabase.query-processor.middleware.desugar :as desugar]
            [metabase.query-processor.middleware.escape-join-aliases :as escape-join-aliases]
            [metabase.query-processor.middleware.expand-macros :as expand-macros]
            [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
            [metabase.query-processor.middleware.fix-bad-references :as fix-bad-refs]
            [metabase.query-processor.middleware.format-rows :as format-rows]
            [metabase.query-processor.middleware.large-int-id :as large-int-id]
            [metabase.query-processor.middleware.limit :as limit]
            [metabase.query-processor.middleware.mbql-to-native :as mbql-to-native]
            [metabase.query-processor.middleware.normalize-query :as normalize]
            [metabase.query-processor.middleware.optimize-temporal-filters :as optimize-temporal-filters]
            [metabase.query-processor.middleware.parameters :as parameters]
            [metabase.query-processor.middleware.permissions :as perms]
            [metabase.query-processor.middleware.pre-alias-aggregations :as pre-alias-ags]
            [metabase.query-processor.middleware.prevent-infinite-recursive-preprocesses :as prevent-infinite-recursive-preprocesses]
            [metabase.query-processor.middleware.process-userland-query :as process-userland-query]
            [metabase.query-processor.middleware.reconcile-breakout-and-order-by-bucketing :as reconcile-bucketing]
            [metabase.query-processor.middleware.resolve-database-and-driver :as resolve-database-and-driver]
            [metabase.query-processor.middleware.resolve-fields :as resolve-fields]
            [metabase.query-processor.middleware.resolve-joined-fields :as resolve-joined-fields]
            [metabase.query-processor.middleware.resolve-joins :as resolve-joins]
            [metabase.query-processor.middleware.resolve-referenced :as resolve-referenced]
            [metabase.query-processor.middleware.resolve-source-table :as resolve-source-table]
            [metabase.query-processor.middleware.results-metadata :as results-metadata]
            [metabase.query-processor.middleware.splice-params-in-response :as splice-params-in-response]
            [metabase.query-processor.middleware.store :as store]
            [metabase.query-processor.middleware.upgrade-field-literals :as upgrade-field-literals]
            [metabase.query-processor.middleware.validate :as validate]
            [metabase.query-processor.middleware.validate-temporal-bucketing :as validate-temporal-bucketing]
            [metabase.query-processor.middleware.visualization-settings :as viz-settings]
            [metabase.query-processor.middleware.wrap-value-literals :as wrap-value-literals]
            [metabase.query-processor.reducible :as qp.reducible]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                QUERY PROCESSOR                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(u/ignore-exceptions
 (classloader/require '[metabase-enterprise.advanced-permissions.query-processor.middleware.permissions :as ee.perms]
                      '[metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries :as ee.audit]
                      '[metabase-enterprise.sandbox.query-processor.middleware
                        [column-level-perms-check :as ee.sandbox.columns]
                        [row-level-restrictions :as ee.sandbox.rows]]))

(def ^:private pre-processing-middleware
  "Pre-processing middleware. Has the form

    (f query) -> query"
  ;; ↓↓↓ PRE-PROCESSING ↓↓↓ happens from TOP TO BOTTOM
  [#'perms/remove-permissions-key
   #'validate/validate-query
   #'expand-macros/expand-macros
   #'resolve-referenced/resolve-referenced-card-resources
   #'parameters/substitute-parameters
   #'resolve-source-table/resolve-source-tables
   #'bucket-datetime/auto-bucket-datetimes
   #'reconcile-bucketing/reconcile-breakout-and-order-by-bucketing
   #'add-source-metadata/add-source-metadata-for-source-queries
   #'upgrade-field-literals/upgrade-field-literals
   (resolve 'ee.sandbox.rows/apply-sandboxing)
   #'implicit-clauses/add-implicit-clauses
   #'add-dim/add-remapped-columns
   #'resolve-fields/resolve-fields
   #'binning/update-binning-strategy
   #'desugar/desugar
   #'add-default-temporal-unit/add-default-temporal-unit
   #'add-implicit-joins/add-implicit-joins
   #'resolve-joins/resolve-joins
   #'resolve-joined-fields/resolve-joined-fields
   #'fix-bad-refs/fix-bad-references
   #'escape-join-aliases/escape-join-aliases
   (resolve 'ee.sandbox.rows/apply-sandboxing)
   #'cumulative-ags/rewrite-cumulative-aggregations
   #'pre-alias-ags/pre-alias-aggregations
   #'wrap-value-literals/wrap-value-literals
   #'auto-parse-filter-values/auto-parse-filter-values
   #'validate-temporal-bucketing/validate-temporal-bucketing
   #'optimize-temporal-filters/optimize-temporal-filters
   #'limit/add-default-limit
   (resolve 'ee.perms/apply-download-limit)
   #'check-features/check-features])

(defn- preprocess*
  "All [[pre-processing-middleware]] combined into a single function. This still needs to be ran in the context
  of [[around-middleware]]. If you want to preprocess a query in isolation use [[preprocess]] below which combines
  this with the [[around-middleware]]."
  [query]
  (reduce
   (fn [query middleware]
     (u/prog1 (cond-> query
                middleware middleware)
       (assert (map? <>) (format "%s did not return a valid query" (pr-str middleware)))))
   query
   pre-processing-middleware))

(def ^:private compile-middleware
  "Middleware for query compilation. Happens after pre-processing. Has the form

    (f (f query rff context)) -> (f query rff context)"
  [#'mbql-to-native/mbql->native])

(def ^:private execution-middleware
  "Middleware that happens after compilation, AROUND query execution itself. Has the form

    (f (f query rff context)) -> (f query rff context)"
  [#'cache/maybe-return-cached-results
   #'perms/check-query-permissions
   (resolve 'ee.perms/check-download-permissions)
   (resolve 'ee.sandbox.columns/maybe-apply-column-level-perms-check)])

(def ^:private post-processing-middleware
  "Post-processing middleware that transforms results. Has the form

    (f preprocessed-query rff) -> rff

  Where `rff` has the form

    (f metadata) -> rf"
  [#'results-metadata/record-and-return-metadata!
   #'limit/limit-result-rows
   (resolve 'ee.perms/limit-download-result-rows)
   #'add-rows-truncated/add-rows-truncated
   #'splice-params-in-response/splice-params-in-response
   #'add-timezone-info/add-timezone-info
   (resolve 'ee.sandbox.rows/merge-sandboxing-metadata)
   #'add-dim/remap-results
   #'format-rows/format-rows
   #'large-int-id/convert-id-to-string
   #'viz-settings/update-viz-settings
   #'cumulative-ags/sum-cumulative-aggregation-columns
   #'annotate/add-column-info])
;; ↑↑↑ POST-PROCESSING ↑↑↑ happens from BOTTOM TO TOP

(defn apply-post-processing-middleware
  "Apply post-processing middleware to `rff`. Returns an rff."
  [query rff]
  (reduce
   (fn [rff middleware]
     (u/prog1 (cond->> rff
                middleware (middleware query))
       (assert (fn? <>) (format "%s did not return a valid function" (pr-str middleware)))))
   rff
   post-processing-middleware))

(def ^:private around-middleware
  "Middleware that goes AROUND *all* the other middleware (even for pre-processing only or compilation only). Has the
  form

    (f qp) -> qp

  Where `qp` has the form

    (f query rff context)"
  [#'resolve-database-and-driver/resolve-database-and-driver
   #'fetch-source-query/resolve-card-id-source-tables
   #'store/initialize-store
   ;; `normalize` has to be done at the very beginning or `resolve-card-id-source-tables` and the like might not work.
   ;; It doesn't really need to be 'around' middleware tho.
   #'normalize/normalize
   (resolve 'ee.audit/handle-internal-queries)])

;; query -> preprocessed = around + pre-process
;; query -> native       = around + pre-process + compile
;; query -> results      = around + pre-process + compile + execute + post-process = default-middleware

(def default-middleware
  "The default set of middleware applied to queries ran via [[process-query]]."
  (letfn [(combined-pre-process [qp]
            (fn combined-pre-process* [query rff context]
              (qp (preprocess* query) rff context)))
          (combined-post-process [qp]
            (fn combined-post-process* [query rff context]
              (qp query (apply-post-processing-middleware query rff) context)))]
    (into
     []
     (comp cat (keep identity))
     [execution-middleware      ; → → execute → → ↓
      compile-middleware        ; ↑ compile       ↓
      [combined-post-process]   ; ↑               ↓ post-process
      [combined-pre-process]    ; ↑ pre-process   ↓
      around-middleware])))     ; ↑ query         ↓ results


;; In REPL-based dev rebuild the QP every time it is called; this way we don't need to reload this namespace when
;; middleware is changed. Outside of dev only build the QP once for performance/locality
(defn- base-qp [middleware]
  (letfn [(qp []
            (qp.reducible/async-qp (qp.reducible/combine-middleware middleware)))]
    (if config/is-dev?
      (fn [& args]
        (apply (qp) args))
      (qp))))

(def ^{:arglists '([query] [query context] [query rff context])} process-query-async
  "Process a query asynchronously, returning a `core.async` channel that is called with the final result (or Throwable)."
  (base-qp default-middleware))

(def ^{:arglists '([query] [query context] [query rff context])} process-query-sync
  "Process a query synchronously, blocking until results are returned. Throws raised Exceptions directly."
  (qp.reducible/sync-qp process-query-async))

(defn process-query
  "Process an MBQL query. This is the main entrypoint to the magical realm of the Query Processor. Returns a *single*
  core.async channel if option `:async?` is true; otherwise returns results in the usual format. For async queries, if
  the core.async channel is closed, the query will be canceled."
  {:arglists '([query] [query context] [query rff context])}
  [{:keys [async?], :as query} & args]
  (apply (if async? process-query-async process-query-sync)
         query
         args))

(defn preprocess
  "Return the fully preprocessed form for `query`, the way it would look immediately
  before [[mbql-to-native/mbql->native]] is called."
  [query]
  (let [qp (qp.reducible/combine-middleware
            (conj (vec around-middleware)
                  prevent-infinite-recursive-preprocesses/prevent-infinite-recursive-preprocesses)
            (fn [query _rff _context]
              (preprocess* query)))]
    (qp query nil nil)))

(defn ^:deprecated query->preprocessed
  "DEPRECATED: Use [[preprocess]] instead."
  [query]
  (preprocess query))

(defn query->expected-cols
  "Return the `:cols` you would normally see in MBQL query results by preprocessing the query and calling `annotate` on
  it. This only works for pure MBQL queries, since it does not actually run the queries. Native queries or MBQL
  queries with native source queries won't work, since we don't need the results."
  [{query-type :type, :as query}]
  (when-not (= (mbql.u/normalize-token query-type) :query)
    (throw (ex-info (tru "Can only determine expected columns for MBQL queries.")
             {:type error-type/qp})))
  ;; TODO - we should throw an Exception if the query has a native source query or at least warn about it. Need to
  ;; check where this is used.
  (qp.store/with-store
    (let [preprocessed (preprocess query)]
      (driver/with-driver (driver.u/database->driver (:database preprocessed))
        (not-empty (vec (annotate/merged-column-info preprocessed nil)))))))

(defn compile
  "Return the native form for `query` (e.g. for a MBQL query on Postgres this would return a map containing the compiled
  SQL form). Like `preprocess`, this function will throw an Exception if preprocessing was not successful."
  [query]
  (let [qp (qp.reducible/combine-middleware
            (conj (vec around-middleware)
                  prevent-infinite-recursive-preprocesses/prevent-infinite-recursive-preprocesses)
            (fn [query _rff _context]
              (mbql-to-native/query->native-form (preprocess* query))))]
    (qp query nil nil)))

(defn compile-and-splice-parameters
  "Return the native form for a `query`, with any prepared statement (or equivalent) parameters spliced into the query
  itself as literals. This is used to power features such as 'Convert this Question to SQL'.
  (Currently, this function is mostly used by tests and in the
  REPL; [[splice-params-in-response/splice-params-in-response]] middleware handles similar functionality for queries
  that are actually executed.)"
  [query]
  ;; We need to preprocess the query first to get a valid database in case we're dealing with a nested query whose DB
  ;; ID is the virtual DB identifier
  (let [driver (driver.u/database->driver (:database (preprocess query)))]
    (driver/splice-parameters-into-native-query driver (compile query))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Userland Queries (Public Interface)                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The difference between `process-query` and the versions below is that the ones below are meant to power various
;; things like API endpoints and pulses, while `process-query` is more of a low-level internal function.
;;
(def userland-middleware
  "The default set of middleware applied to 'userland' queries ran via [[process-query-and-save-execution!]] (i.e., via
  the REST API). This middleware has the pattern

    (f (f query rff context)) -> (f query rff context)"
  (concat
   default-middleware
   [#'constraints/add-default-userland-constraints
    #'process-userland-query/process-userland-query
    #'catch-exceptions/catch-exceptions]))

(def ^{:arglists '([query] [query context])} process-userland-query-async
  "Like [[process-query-async]], but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
  (base-qp userland-middleware))

(def ^{:arglists '([query] [query context])} process-userland-query-sync
  "Like [[process-query-sync]], but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
  (qp.reducible/sync-qp process-userland-query-async))

(defn process-userland-query
  "Like [[process-query]], but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
  {:arglists '([query] [query context])}
  [{:keys [async?], :as query} & args]
  (apply (if async? process-userland-query-async process-userland-query-sync)
         query
         args))

(s/defn process-query-and-save-execution!
  "Process and run a 'userland' MBQL query (e.g. one ran as the result of an API call, scheduled Pulse, etc). Returns
  results in a format appropriate for consumption by FE client. Saves QueryExecution row in application DB."
  ([query info]
   (process-userland-query (assoc query :info info)))

  ([query info context]
   (process-userland-query (assoc query :info info) context)))

(defn- add-default-constraints [query]
  (assoc-in query [:middleware :add-default-userland-constraints?] true))

(s/defn process-query-and-save-with-max-results-constraints!
  "Same as [[process-query-and-save-execution!]] but will include the default max rows returned as a constraint. (This
  function is ulitmately what powers most API endpoints that run queries, including `POST /api/dataset`.)"
  ([query info]
   (process-query-and-save-execution! (add-default-constraints query) info))

  ([query info context]
   (process-query-and-save-execution! (add-default-constraints query) info context)))
