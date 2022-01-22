(ns metabase.query-processor
  "Primary entrypoints to running Metabase (MBQL) queries.

    (metabase.query-processor/process-query {:type :query, :database 1, :query {:source-table 2}})

  Various REST API endpoints, such as `POST /api/dataset`, return the results of queries; calling one variations of
  `process-userland-query` (see documentation below)."
  (:require [clojure.tools.logging :as log]
            [metabase.driver :as driver]
            [metabase.mbql.util :as mbql.u]
            [metabase.plugins.classloader :as classloader]
            [metabase.query-processor.compile :as compile]
            [metabase.query-processor.context.default :as context.default]
            [metabase.query-processor.middleware.cache :as cache]
            [metabase.query-processor.middleware.catch-exceptions :as catch-exceptions]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.query-processor.middleware.permissions :as perms]
            [metabase.query-processor.middleware.process-userland-query :as process-userland-query]
            [metabase.query-processor.middleware.results-metadata :as results-metadata]
            [metabase.query-processor.postprocess :as postprocess]
            [metabase.query-processor.preprocess :as preprocess]
            [metabase.query-processor.process-common :as process-common]
            [metabase.query-processor.reducible :as qp.reducible]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]
            [metabase.query-processor.context :as context]
            [metabase.query-processor.error-type :as qp.error-type]))

(u/ignore-exceptions
  (classloader/require 'metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries
                       'metabase-enterprise.sandbox.query-processor.middleware.column-level-perms-check))

(defn ^:deprecated query->preprocessed
  [query]
  (preprocess/preprocess query))

(defn ^:deprecated query->expected-cols
  [query]
  (preprocess/query->expected-cols query))

(defn ^:deprecated query->native [query]
  (compile/compile query))

(defn ^:deprecated query->native-with-spliced-params [query]
  (println "(pr-str query):" (pr-str query)) ; NOCOMMIT
  (println "(pr-str (compile/compile-and-splice-params query)):" (pr-str (compile/compile-and-splice-params query))) ; NOCOMMIT
  (:native (compile/compile-and-splice-params query)))

(defmulti process-query*
  {:arglists '([query rff context])}
  (fn [{query-type :type} _rff _context]
    {:post [(keyword? %)]}
    (mbql.u/normalize-token query-type)))

(defn process-query
  "Process an MBQL query. This is the main entrypoint to the magical realm of the Query Processor. Returns a *single*
  core.async channel if option `:async?` is true; otherwise returns results in the usual format. For async queries, if
  the core.async channel is closed, the query will be canceled."
  ([query]             (process-query* query nil nil))
  ([query context]     (process-query* query nil context))
  ([query rff context] (process-query* query rff context)))

(defn- execute* [query rff context]
  (log/tracef "Query:\n%s" (u/pprint-to-str query))
  (process-common/ensure-store-and-driver query
    (let [preprocessed (preprocess/preprocess query)
          _            (log/tracef "Preprocessed:\n%s" (u/pprint-to-str preprocessed))
          native       (compile/compile-preprocessed preprocessed)
          rff          (postprocess/post-processing-xform preprocessed rff)]
      (log/tracef "Compiled:\n%s" (u/pprint-to-str native))
      (context/runf native rff context))))

(def ^:private execution-middleware
  [#'cache/maybe-return-cached-results
   (resolve 'metabase-enterprise.sandbox.query-processor.middleware.column-level-perms-check/maybe-apply-column-level-perms-check)
   #'perms/check-query-permissions
   #'results-metadata/record-and-return-metadata!])

(defn- base-qp [query rff context]
  (let [rff     (or rff
                    (:rff context)
                    (context.default/default-rff))
        context (merge (context.default/default-context)
                       context)
        qp      (reduce
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
  (qp.reducible/sync-qp process-query-async))

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
                (try
                  (middleware qp)
                  (catch Throwable e
                    (throw (ex-info (tru "Error applying userland query processor middleware {0}: {1}"
                                         (pr-str middleware)
                                         (ex-message e))
                                    {:middleware (pr-str middleware)
                                     :type       (:type (ex-data e) qp.error-type/qp)}
                                    e))))
                qp))
            base-qp
            userland-middleware)]
    (qp query rff context)))

(def ^{:arglists '([query] [query rff context] [query context])} process-userland-query-async
  "Like [[process-query-async]], but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
  (qp.reducible/async-qp userland-base-qp))

(def ^{:arglists '([query] [query rff context] [query context])} process-userland-query-sync
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

(when-let [ee-audit-qp (resolve 'metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries/process-internal-query)]
  (defmethod process-query* :internal
    [query rff context]
    (ee-audit-qp query rff context)))
