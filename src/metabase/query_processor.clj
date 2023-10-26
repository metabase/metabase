(ns metabase.query-processor
  "Primary entrypoints to running Metabase (MBQL) queries.

    (metabase.query-processor/process-query {:type :query, :database 1, :query {:source-table 2}})

  Various REST API endpoints, such as `POST /api/dataset`, return the results of queries; calling one variations of
  `process-userland-query` (see documentation below)."
  (:refer-clojure :exclude [compile])
  (:require
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.mbql.util :as mbql.u]
   [metabase.plugins.classloader :as classloader]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.add-dimension-projections :as qp.add-dimension-projections]
   [metabase.query-processor.middleware.add-rows-truncated :as qp.add-rows-truncated]
   [metabase.query-processor.middleware.add-timezone-info :as qp.add-timezone-info]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.middleware.cache :as cache]
   [metabase.query-processor.middleware.catch-exceptions :as catch-exceptions]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.cumulative-aggregations :as qp.cumulative-aggregations]
   [metabase.query-processor.middleware.escape-join-aliases :as escape-join-aliases]
   [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
   [metabase.query-processor.middleware.format-rows :as format-rows]
   [metabase.query-processor.middleware.large-int-id :as large-int-id]
   [metabase.query-processor.middleware.limit :as limit]
   [metabase.query-processor.middleware.mbql-to-native :as mbql-to-native]
   [metabase.query-processor.middleware.normalize-query :as normalize]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.middleware.process-userland-query :as process-userland-query]
   [metabase.query-processor.middleware.resolve-database-and-driver :as qp.resolve-database-and-driver]
   [metabase.query-processor.middleware.results-metadata :as results-metadata]
   [metabase.query-processor.middleware.splice-params-in-response :as splice-params-in-response]
   [metabase.query-processor.middleware.store :as store]
   [metabase.query-processor.middleware.visualization-settings :as viz-settings]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [schema.core :as s]
   [metabase.lib.convert :as lib.convert]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.execute :as qp.execute]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.postprocess :as qp.postprocess]
   [clojure.core.async :as a]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                QUERY PROCESSOR                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(when config/ee-available?
  (classloader/require '[metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries :as ee.audit]))

(defn- restore-join-aliases [preprocessed-query]
  (let [replacement (-> preprocessed-query :info :alias/escaped->original)]
    (escape-join-aliases/restore-aliases preprocessed-query replacement)))

(defn default-rff []
  (fn [initial-metadata]
    (let [rows (volatile! (transient []))]
      (fn
        ([]
         {:data {:results_metadata initial-metadata}})
        ([result]
         (assoc-in result [:data :rows] (persistent! @rows)))
        ([result row]
         (vreset! rows (conj! @rows row))
         result)))))

(defn sync-context []
  {:canceled-chan (a/promise-chan)})

(defn async-context []
  {:canceled-chan (a/promise-chan)})

(defn process-query
  ([query]
   (process-query query (default-rff)))

  ([query rff]
   (process-query query rff (sync-context)))

  ([query rff context]
   (qp.setup/do-with-qp-setup
    query
    (^:once fn* [query]
     (let [preprocessed (qp.preprocess/preprocess query)
           compiled     (qp.compile/compile preprocessed)
           rff          (qp.postprocess/postprocessing-rff compiled rff)]
       (qp.execute/execute compiled rff context))))))

(comment
  (defn x []
    (metabase.query-processor.preprocess/preprocess
     (metabase.test/mbql-query checkins)))

  (defn y []
    (metabase.query-processor/process-query
     (metabase.test/mbql-query checkins {:limit 10})))

  (require 'criterium.core)
  (defn z []
    (criterium.core/quick-bench (y))))

;; Evaluation count : 84 in 6 samples of 14 calls.
;;              Execution time mean : 7.622605 ms
;;     Execution time std-deviation : 245.993211 µs
;;    Execution time lower quantile : 7.294671 ms ( 2.5%)
;;    Execution time upper quantile : 7.888031 ms (97.5%)
;;                    Overhead used : 1.471742 ns


;; ;;; TODO -- move to [[qp.preprocess]]
;; (defn query->expected-cols
;;   "Return the `:cols` you would normally see in MBQL query results by preprocessing the query and calling `annotate` on
;;   it. This only works for pure MBQL queries, since it does not actually run the queries. Native queries or MBQL
;;   queries with native source queries won't work, since we don't need the results."
;;   [{query-type :type, :as query}]
;;   (when-not (= (mbql.u/normalize-token query-type) :query)
;;     (throw (ex-info (tru "Can only determine expected columns for MBQL queries.")
;;                     {:type qp.error-type/qp})))
;;   ;; TODO - we should throw an Exception if the query has a native source query or at least warn about it. Need to
;;   ;; check where this is used.
;;   (qp.store/with-metadata-provider (qp.resolve-database-and-driver/resolve-database-id query)
;;     (let [preprocessed (-> query qp.preprocess/preprocess restore-join-aliases)]
;;       (driver/with-driver (driver.u/database->driver (:database preprocessed))
;;         (->> (annotate/merged-column-info preprocessed nil)
;;              ;; remove MLv2 columns so we don't break a million tests. Once the whole QP is updated to use MLv2 metadata
;;              ;; directly we can stop stripping these out
;;              (mapv (fn [col]
;;                      (dissoc col :lib/external_remap :lib/internal_remap)))
;;              not-empty)))))

;; (defn compile-and-splice-parameters
;;   "Return the native form for a `query`, with any prepared statement (or equivalent) parameters spliced into the query
;;   itself as literals. This is used to power features such as 'Convert this Question to SQL'.
;;   (Currently, this function is mostly used by tests and in the
;;   REPL; [[splice-params-in-response/splice-params-in-response]] middleware handles similar functionality for queries
;;   that are actually executed.)"
;;   [query]
;;   ;; We need to preprocess the query first to get a valid database in case we're dealing with a nested query whose DB
;;   ;; ID is the virtual DB identifier
;;   (let [driver (driver.u/database->driver (:database (qp.preprocess/preprocess query)))]
;;     (driver/splice-parameters-into-native-query driver (compile query))))


;; ;;; +----------------------------------------------------------------------------------------------------------------+
;; ;;; |                                      Userland Queries (Public Interface)                                       |
;; ;;; +----------------------------------------------------------------------------------------------------------------+

;; ;; The difference between `process-query` and the versions below is that the ones below are meant to power various
;; ;; things like API endpoints and pulses, while `process-query` is more of a low-level internal function.
;; ;;
;; (def userland-middleware
;;   "The default set of middleware applied to 'userland' queries ran via [[process-query-and-save-execution!]] (i.e., via
;;   the REST API). This middleware has the pattern

;;     (f (f query rff context)) -> (f query rff context)"
;;   (concat
;;    default-middleware
;;    [#'qp.constraints/add-default-userland-constraints
;;     #'process-userland-query/process-userland-query
;;     #'catch-exceptions/catch-exceptions]))

;; (def ^{:arglists '([query] [query context])} process-userland-query-async
;;   "Like [[process-query-async]], but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
;;   (base-qp userland-middleware))

;; (def ^{:arglists '([query] [query context])} process-userland-query-sync
;;   "Like [[process-query-sync]], but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
;;   (qp.reducible/sync-qp process-userland-query-async))

;; (defn process-userland-query
;;   "Like [[process-query]], but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
;;   {:arglists '([query] [query context])}
;;   [{:keys [async?], :as query} & args]
;;   (apply (if async? process-userland-query-async process-userland-query-sync)
;;          query
;;          args))

;; (s/defn process-query-and-save-execution!
;;   "Process and run a 'userland' MBQL query (e.g. one ran as the result of an API call, scheduled Pulse, etc). Returns
;;   results in a format appropriate for consumption by FE client. Saves QueryExecution row in application DB."
;;   ([query info]
;;    (process-userland-query (assoc query :info info)))

;;   ([query info context]
;;    (process-userland-query (assoc query :info info) context)))

;; (defn- add-default-constraints [query]
;;   (assoc-in query [:middleware :add-default-userland-constraints?] true))

;; (s/defn process-query-and-save-with-max-results-constraints!
;;   "Same as [[process-query-and-save-execution!]] but will include the default max rows returned as a constraint. (This
;;   function is ulitmately what powers most API endpoints that run queries, including `POST /api/dataset`.)"
;;   ([query info]
;;    (process-query-and-save-execution! (add-default-constraints query) info))

;;   ([query info context]
;;    (process-query-and-save-execution! (add-default-constraints query) info context)))
