(ns metabase.api.advanced-computation.common
  "Common routines between the public and internal endpoints for /api/advanced_computation"
  (:require [clojure.core.async :as a]
            [metabase.api.common :as api]
            [metabase.query-processor :as qp]
            [metabase.query-processor
             [context :as qp.context]
             [pivot :as pivot]
             [store :as qp.store]]))

(defn- process-query-append-results
  "Reduce the results of a single `query` using `rf` and initial value `init`."
  [query rf init context]
  (if (a/poll! (qp.context/canceled-chan context))
    (ensure-reduced init)
    (qp/process-query-sync
     query
     {:canceled-chan (qp.context/canceled-chan context)
      :rff           (fn [_]
                       (fn
                         ([]        init)
                         ([acc]     acc)
                         ([acc row] (rf acc ((:row-mapping-fn context) row context)))))})))

(defn- process-queries-append-results
  "Reduce the results of a sequence of `queries` using `rf` and initial value `init`."
  [queries rf init context]
  (reduce
   (fn [acc query]
     (process-query-append-results query rf acc (assoc context
                                                       :pivot-column-mapping ((:column-mapping-fn context) query))))
   init
   queries))

(defn- append-queries-context
  "Update Query Processor `context` so it appends the rows fetched when running `more-queries`."
  [context more-queries]
  (cond-> context
    (seq more-queries)
    (update :rff (fn [rff]
                   (fn [metadata]
                     (let [rf (rff metadata)]
                       (fn
                         ([]        (rf))
                         ([acc]     (rf (process-queries-append-results more-queries rf acc context)))
                         ([acc row] (rf acc row)))))))))

(defn process-multiple-queries
  "Allows the query processor to handle multiple queries, stitched together to appear as one"
  [[first-query & more-queries] context]
  (qp/process-query first-query (append-queries-context context more-queries)))

(defn run-query
  "Run the pivot query. Unlike many query execution functions, this takes `context` as the first parameter to support
   its application via `partial`.

   You are expected to wrap this call in `qp.streaming/streaming-response` yourself."
  ([context query]
   (run-query context query {:executed-by api/*current-user-id*}))

  ([context query info]
   (qp.store/with-store
     (let [main-breakout           (:breakout (:query query))
           col-determination-query (pivot/add-grouping-field query main-breakout 0)
           all-expected-cols       (qp/query->expected-cols col-determination-query)
           all-queries             (pivot/generate-queries query)]
       (process-multiple-queries
        all-queries
        (assoc context
               :info (assoc info :context context)
               ;; this function needs to be executed at the start of every new query to
               ;; determine the mapping for maintaining query shape
               :column-mapping-fn (fn [query]
                                    (let [query-cols (map-indexed vector (qp/query->expected-cols query))]
                                      (map (fn [item]
                                             (some #(when (= (:name item) (:name (second %)))
                                                      (first %)) query-cols))
                                           all-expected-cols)))
               ;; this function needs to be called for each row so that it can actually
               ;; shape the row according to the `:column-mapping-fn` above
               :row-mapping-fn (fn [row context]
                                 ;; the first query doesn't need any special mapping, it already has all the columns
                                 (if-let [col-mapping (:pivot-column-mapping context)]
                                   (map (fn [mapping]
                                          (when mapping
                                            (nth row mapping)))
                                        col-mapping)
                                   row))))))))
