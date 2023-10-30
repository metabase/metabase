(ns metabase.query-processor
  "Primary entrypoints to running Metabase (MBQL) queries.

    (metabase.query-processor/process-query {:type :query, :database 1, :query {:source-table 2}})

  Various REST API endpoints, such as `POST /api/dataset`, return the results of queries; calling one variations of
  `process-userland-query` (see documentation below)."
  (:refer-clojure :exclude [compile])
  (:require
   [clojure.core.async :as a]
   [metabase.config :as config]
   [metabase.plugins.classloader :as classloader]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.execute :as qp.execute]
   [metabase.query-processor.middleware.escape-join-aliases :as escape-join-aliases]
   [metabase.query-processor.postprocess :as qp.postprocess]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.lib.core :as lib]
   [metabase.driver :as driver]
   [metabase.async.util :as async.u]
   [metabase.util.malli.schema :as ms]
   [metabase.util.malli :as mu]
   [metabase.query-processor.context-2 :as qp.context]
   [metabase.query-processor.userland :as qp.userland]))

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

(mu/defn ^:private default-context :- qp.context/ContextInstance
  [query :- :map]
  (if (:async? query)
    (qp.context/async-context)
    (qp.context/sync-context)))

(mu/defn process-query
  ([query]
   (process-query query (default-rff)))

  ([query rff]
   (process-query query rff (default-context query)))

  ([query   :- :map
    rff     :- fn?
    context :- qp.context/ContextInstance]
   (qp.setup/do-with-qp-setup
    query
    (^:once fn* [query]
     (let [preprocessed  (qp.preprocess/preprocess query)
           compiled      (qp.compile/compile preprocessed)
           rff           (qp.postprocess/postprocessing-rff compiled rff)
           execute-thunk (^:once fn* []
                          (qp.execute/execute compiled rff context))]
       (qp.context/execute context execute-thunk))))))

;; NOCOMMIT
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

(defn ^:deprecated preprocess
  "DEPRECATED: use [[qp.preprocess/preprocess]] instead."
  [query]
  (qp.preprocess/preprocess query))

;;; TODO -- move to [[qp.preprocess]]
(defn query->expected-cols
  "Return the `:cols` you would normally see in MBQL query results by preprocessing the query and calling `annotate` on
  it. This only works for pure MBQL queries, since it does not actually run the queries. Native queries or MBQL
  queries with native source queries won't work, since we don't need the results."
  [query]
  (qp.setup/do-with-qp-setup
   query
   (^:once fn* [query]
    (lib/returned-columns (qp.preprocess/preprocess query))))
  ;; (when-not (= (mbql.u/normalize-token query-type) :query)
  ;;   (throw (ex-info (tru "Can only determine expected columns for MBQL queries.")
  ;;                   {:type qp.error-type/qp})))
  ;; ;; TODO - we should throw an Exception if the query has a native source query or at least warn about it. Need to
  ;; ;; check where this is used.
  ;; (qp.store/with-metadata-provider (qp.resolve-database-and-driver/resolve-database-id query)
  ;;   (let [preprocessed (-> query qp.preprocess/preprocess restore-join-aliases)]
  ;;     (driver/with-driver (driver.u/database->driver (:database preprocessed))
  ;;       (->> (annotate/merged-column-info preprocessed nil)
  ;;            ;; remove MLv2 columns so we don't break a million tests. Once the whole QP is updated to use MLv2 metadata
  ;;            ;; directly we can stop stripping these out
  ;;            (mapv (fn [col]
  ;;                    (dissoc col :lib/external_remap :lib/internal_remap)))
  ;;            not-empty))))
  )

(defn ^:deprecated compile
  [query]
  (qp.setup/do-with-qp-setup
   query
   (^:once fn* [query]
    (-> query
        qp.preprocess/preprocess
        qp.compile/compile
        :native))))

;;; TODO -- move to [[qp.compile]]
(defn compile-and-splice-parameters
  "Return the native form for a `query`, with any prepared statement (or equivalent) parameters spliced into the query
  itself as literals. This is used to power features such as 'Convert this Question to SQL'.
  (Currently, this function is mostly used by tests and in the
  REPL; [[splice-params-in-response/splice-params-in-response]] middleware handles similar functionality for queries
  that are actually executed.)"
  [query]
  (qp.setup/do-with-qp-setup
   query
   (^:once fn* [query]
    (let [preprocessed (qp.preprocess/preprocess query)
          compiled     (qp.compile/compile preprocessed)]
      (driver/splice-parameters-into-native-query driver/*driver* (:native compiled))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Userland Queries (Public Interface)                                       |
;;; +----------------------------------------------------------------------------------------------------------------+


(defn ^:deprecated process-userland-query
  "Like [[process-query]], but for 'userland' queries (e.g., queries ran via the REST API). Adds extra middleware."
  ([query]
   (process-userland-query query (default-context query)))

  ([query context]
   (process-query query (qp.userland/userland-context context))))

(defn ^:deprecated process-query-and-save-execution!
  "Process and run a 'userland' MBQL query (e.g. one ran as the result of an API call, scheduled Pulse, etc). Returns
  results in a format appropriate for consumption by FE client. Saves QueryExecution row in application DB."
  ([query info]
   (process-query-and-save-execution! query info (default-context query)))

  ([query info context]
   (process-query (assoc query :info info) (qp.userland/userland-context context))))

(defn- add-default-constraints [query]
  (assoc-in query [:middleware :add-default-userland-constraints?] true))

(defn ^:deprecated process-query-and-save-with-max-results-constraints!
  "Same as [[process-query-and-save-execution!]] but will include the default max rows returned as a constraint. (This
  function is ulitmately what powers most API endpoints that run queries, including `POST /api/dataset`.)"
  ([query info]
   (process-query-and-save-with-max-results-constraints! query info (default-context query)))

  ([query info context]
   (process-query (add-default-constraints (assoc query :info info))
                  (qp.userland/userland-context context))))
