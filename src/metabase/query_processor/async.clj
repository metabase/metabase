(ns ^:deprecated metabase.query-processor.async
  "Async versions of the usual public query processor functions. Instead of blocking while the query is ran, these
  functions all return a `core.async` channel that can be used to fetch the results when they become available.

  TODO ­ none of these functions are needed anymore, just use `metabase.query-processor/process-query-async` and the
  like directly."
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.async.util :as async.u]
            [metabase.query-processor
             [interface :as qpi]
             [util :as qputil]]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s])
  (:import clojure.core.async.impl.channels.ManyToManyChannel))

(s/defn ^{:deprecated "0.35.0"} process-query :- async.u/PromiseChan
  "Async version of `metabase.query-processor/process-query`. Runs query asynchronously, and returns a `core.async`
  channel that can be used to fetch the results once the query finishes running. Closing the channel will cancel the
  query."
  [query]
  (qp/process-query (assoc query :async? true)))

(s/defn ^{:deprecated "0.35.0"} process-query-and-save-execution! :- async.u/PromiseChan
  "Async version of `metabase.query-processor/process-query-and-save-execution!`. Runs query asynchronously, and returns
  a `core.async` channel that can be used to fetch the results once the query finishes running. Closing the channel
  will cancel the query."
  [query options]
  (qp/process-query-and-save-execution! (assoc query :async? true) options))

(s/defn ^{:deprecated "0.35.0"} process-query-and-save-with-max-results-constraints! :- async.u/PromiseChan
  "Async version of `metabase.query-processor/process-query-and-save-with-max-results-constraints!`. Runs query
  asynchronously, and returns a `core.async` channel that can be used to fetch the results once the query finishes
  running. Closing the channel will cancel the query."
  [query options]
  (qp/process-query-and-save-with-max-results-constraints! (assoc query :async? true) options))


;;; ------------------------------------------------ Result Metadata -------------------------------------------------

(defn- transform-result-metadata-query-results
  [result]
  (if (instance? Throwable result)
    (log/error (trs "Error running query to determine Card result metadata:")
               (u/pprint-to-str 'red result))
    (or (get-in result [:data :results_metadata :columns])
        [])))

(defn- transform-result-metadata-xform [rf]
  (fn
    ([]    (rf))
    ([x]   (rf x))
    ([x y] (rf x (transform-result-metadata-query-results y)))))

(defn- query-for-result-metadata [query]
  ;; for purposes of calculating the actual Fields & types returned by this query we really only need the first
  ;; row in the results
  (let [query (-> query
                  (assoc-in [:constraints :max-results] 1)
                  (assoc-in [:constraints :max-results-bare-rows] 1)
                  (assoc-in [:info :executed-by] api/*current-user-id*))]
    ;; need add the constraints above before calculating hash because those affect the hash
    ;;
    ;; (normally middleware takes care of calculating query hashes for 'userland' queries but this is not
    ;; technically a userland query -- we don't want to save a QueryExecution -- so we need to add `executed-by`
    ;; and `query-hash` ourselves so the remark gets added)
    (assoc-in query [:info :query-hash] (qputil/query-hash query))))

(s/defn result-metadata-for-query-async :- ManyToManyChannel
  "Fetch the results metadata for a `query` by running the query and seeing what the QP gives us in return.
   This is obviously a bit wasteful so hopefully we can avoid having to do this. Returns a channel to get the
   results."
  [query]
  (binding [qpi/*disable-qp-logging* true]
    (let [query     (query-for-result-metadata query)
          out-chan  (qp/process-query-async query)
          out-chan* (a/promise-chan transform-result-metadata-xform)]
      ;; out-chan* will be closed when out-chan closes
      (a/pipe out-chan out-chan*)
      ;; close `out-chan` when `out-chan*` closes or gets a result
      (a/go
        (a/<! out-chan*)
        (a/close! out-chan))
      out-chan*)))
