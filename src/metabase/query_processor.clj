(ns metabase.query-processor
  "Primary entrypoints to running Metabase (MBQL) queries.

    (metabase.query-processor/process-query {:type :query, :database 1, :query {:source-table 2}})

  Various REST API endpoints, such as `POST /api/dataset`, return the results of queries; calling one variations of
  `process-userland-query` (see documentation below)."
  (:refer-clojure :exclude [compile])
  (:require [metabase.driver :as driver]
            [metabase.mbql.util :as mbql.u]
            [metabase.plugins.classloader :as classloader]
            [metabase.query-processor.compile :as compile]
            [metabase.query-processor.context.default :as context.default]
            [metabase.query-processor.middleware.catch-exceptions :as catch-exceptions]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.query-processor.middleware.process-userland-query :as process-userland-query]
            [metabase.query-processor.postprocess :as postprocess]
            [metabase.query-processor.preprocess :as preprocess]
            [metabase.query-processor.process-common :as process-common]
            [metabase.query-processor.reducible :as qp.reducible]
            [metabase.util :as u]
            [schema.core :as s]
            [clojure.tools.logging :as log]
            [metabase.config :as config]
            [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.mbql.util :as mbql.u]
            [metabase.plugins.classloader :as classloader]
            [metabase.query-processor.context :as context]
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
            [schema.core :as s]
            [metabase.query-processor.middleware.results-metadata :as results-metadata]
            [clojure.tools.logging :as log]))

(u/ignore-exceptions
  (classloader/require '[metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries :as ee.audit]
                       '[metabase-enterprise.sandbox.query-processor.middleware
                         [column-level-perms-check :as ee.sandbox.columns]
                         [row-level-restrictions :as ee.sandbox.rows]]))

(defmulti process-query*
  {:arglists '([query rff context])}
  (fn [{query-type :type} _rff _context]
    {:post [(keyword? %)]}
    (mbql.u/normalize-token query-type)))

(defn process-query
  "Process an MBQL query. This is the main entrypoint to the magical realm of the Query Processor. Returns a *single*
  core.async channel if option `:async?` is true; otherwise returns results in the usual format. For async queries, if
  the core.async channel is closed, the query will be canceled."
  ([query]             (process-query* query context.default/default-rff (context.default/default-context)))
  ([query context]     (process-query* query context.default/default-rff context))
  ([query rff context] (process-query* query rff                         context)))

;;;; Pre-processing

(defn ^:deprecated query->preprocessed
  [query]
  (preprocess/preprocess query))

(defn ^:deprecated query->expected-cols
  [query]
  (preprocess/query->expected-cols query))

(defn- ^:deprecated query->native [query]
  (compile/compile query))

(defn- execute* [query rff context]
  (log/tracef "Query:\n%s" (u/pprint-to-str query))
  (process-common/ensure-store-and-driver query
    (let [preprocessed (preprocess/preprocess query)
          _            (log/tracef "Preprocessed:\n%s" (u/pprint-to-str preprocessed))
          native       (compile/compile-preprocessed preprocessed)
          rff          (postprocess/post-processing-xform preprocessed rff)]
      (log/tracef "Compiled:\n%s" (u/pprint-to-str native))
      (driver/execute-reducible-query
       driver/*driver*
       native
       context
       (fn respond
         [metadata rows]
         (let [rf (rff metadata)]
           (transduce identity rf rows))))
      #_(context/runf native rff context))))

(def ^:private execution-middleware
  []
  #_[#'cache/maybe-return-cached-results
   (resolve 'ee.sandbox.columns/maybe-apply-column-level-perms-check)
     #'perms/check-query-permissions
     #'results-metadata/record-and-return-metadata!])

(defn- base-qp
  [query rff context]
  (println "query:" query) ; NOCOMMIT
  (println "rff:" rff) ; NOCOMMIT
  (println "context:" context) ; NOCOMMIT
  (let [qp (reduce
            (fn [qp middleware]
              (if middleware
                (middleware qp)
                qp))
            execute*
            execution-middleware)]
    (qp query rff context)))

(def ^{:arglists '([query] [query context] [query rff context])} process-query-async
  "Process a query asynchronously, returning a `core.async` channel that is called with the final result (or Throwable)."
  (qp.reducible/async-qp base-qp))

(def ^{:arglists '([query] [query context] [query rff context])} process-query-sync
  "Process a query synchronously, blocking until results are returned. Throws raised Exceptions directly."
  (qp.reducible/sync-qp base-qp))

(defmethod process-query* :default
  [{:keys [async?], :as query} rff context]
  ((if async? process-query-async process-query-sync) query rff context))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Userland Queries (Public Interface)                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The difference between `process-query` and the versions below is that the ones below are meant to power various
;; things like API endpoints and pulses, while `process-query` is more of a low-level internal function.

;; TODO -- I think most of this stuff doesn't NEED to be middleware, at least [[catch-exceptions/catch-exceptions]]
;; probably shouldn't be.
(def ^:private userland-middleware
  "The default set of middleware applied to 'userland' queries ran via [[process-query-and-save-execution!]] (i.e., via
  the REST API)."
  [#'constraints/add-default-userland-constraints
   #'process-userland-query/process-userland-query
   #'catch-exceptions/catch-exceptions])

(defn- userland-base-qp
  [query rff context]
  (let [qp (reduce
            (fn [qp middleware]
              (if middleware
                (middleware qp)
                qp))
            userland-middleware
            base-qp)]
    (qp query rff context)))

(def ^{:arglists '([query] [query rff context] [query context])} process-userland-query-async
  "Like [[process-query-async]], but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
  (qp.reducible/async-qp userland-base-qp))

(def ^{:arglists '([query] [query rff context] [query context])} process-userland-query-sync
  "Like `process-query-sync`, but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
  (qp.reducible/sync-qp userland-base-qp))

(defn process-userland-query
  "Like `process-query`, but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
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


;;; EE Audit Queries

(when-let [ee-audit-qp (resolve 'ee.audit/process-internal-query)]
  (defmethod process-query* :internal
    [query rff context]
    (ee-audit-qp query rff context)))
