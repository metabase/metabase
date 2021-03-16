(ns metabase.query-processor.pivot
  "Pivot table actions for the query processor"
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.mbql.normalize :as mbql.normalize]
            [metabase.query-processor :as qp]
            [metabase.query-processor.context :as qp.context]
            [metabase.query-processor.context.default :as context.default]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]))

(defn powerset
  "Generate a powerset while maintaining the original ordering as much as possible"
  [xs]
  (for [combo (reverse (range (int (Math/pow 2 (count xs)))))]
    (for [item  (range 0 (count xs))
          :when (not (zero? (bit-and (bit-shift-left 1 item) combo)))]
      (nth xs item))))

(defn- group-bitmask
  "Come up with a display name given a combination of breakout `indices` e.g.

  This is basically a bitmask of which breakout indices we're excluding, but reversed. Why? This is how Postgres and
  other DBs determine group numbers. This implements basically what PostgreSQL does for grouping -- look at the
  original set of groups - if that column is part of *this* group, then set the appropriate bit (entry 1 sets bit 1,
  etc)

    (group-bitmask 3 [1])   ; -> [_ 1 _] -> 101 -> 101 -> 5
    (group-bitmask 3 [1 2]) ; -> [_ 1 2] -> 100 -> 011 -> 1"
  [num-breakouts indices]
  (transduce
   (map (partial bit-shift-left 1))
   (completing bit-xor)
   (int (dec (Math/pow 2 num-breakouts)))
   indices))

(defn- breakout-combinations
  "Return a sequence of all breakout combinations (by index) we should generate queries for.

    (breakout-combinations 3 [1 2] nil) ;; -> [[0 1 2] [] [1 2] [2] [1]]"
  [num-breakouts pivot-rows pivot-cols]
  ;; validate pivot-rows/pivot-cols
  (doseq [[k pivots] {:pivot-rows pivot-rows, :pivot-cols pivot-cols}
          i          pivots]
    (when (>= i num-breakouts)
      (throw (ex-info (tru "Invalid {0}: specified breakout at index {1}, but we only have {2} breakouts"
                           (name k) i num-breakouts)
                      {:type          qp.error-type/invalid-query
                       :num-breakouts num-breakouts
                       :pivot-rows    pivot-rows
                       :pivot-cols    pivot-cols}))))
  (sort-by
   (partial group-bitmask num-breakouts)
   (distinct
    (map
     vec
     ;; this can happen for the public/embed endpoints, where we aren't given a pivot-rows / pivot-cols parameter, so
     ;; we'll just generate everything
     (if (empty? (concat pivot-rows pivot-cols))
       (powerset (range 0 num-breakouts))
       (concat
        ;; e.g. given num-breakouts = 4; pivot-rows = [0 1 2]; pivot-cols = [3]
        ;; primary data: return all breakouts
        ;; => [0 1 2 3] => 0000 => Group #15
        [(range num-breakouts)]
        ;; subtotal rows
        ;; _.range(1, pivotRows.length).map(i => [...pivotRow.slice(0, i), ...pivotCols])
        ;;  => [0 _ _ 3] [0 1 _ 3] => 0110 0100 => Group #6, #4
        (for [i (range 1 (count pivot-rows))]
          (concat (take i pivot-rows) pivot-cols))
        ;; “row totals” on the right
        ;; pivotRows
        ;; => [0 1 2 _] => 1000 => Group #8
        [pivot-rows]
        ;; subtotal rows within “row totals”
        ;; _.range(1, pivotRows.length).map(i => pivotRow.slice(0, i))
        ;; => [0 _ _ _] [0 1 _ _] => 1110 1100 => Group #14, #12
        (for [i (range 1 (count pivot-rows))]
          (take i pivot-rows))
        ;; “grand totals” row
        ;; pivotCols
        ;; => [_ _ _ 3] => 0111 => Group #7
        [pivot-cols]
        ;; bottom right corner [_ _ _ _] => 1111 => Group #15
        [[]]))))))

(defn- add-grouping-field
  "Add the grouping field and expression to the query"
  [query breakout bitmask]
  (as-> query query
    ;;TODO: replace this value with a bitmask or something to indicate the source better
    (update-in query [:query :expressions] assoc :pivot-grouping [:abs bitmask])
    ;; in PostgreSQL and most other databases, all the expressions must be present in the breakouts. Add a pivot
    ;; grouping expression ref to the breakouts
    (assoc-in query [:query :breakout] (concat breakout [[:expression "pivot-grouping"]]))
    (do
      (log/tracef "Added pivot-grouping expression to query\n%s" (u/pprint-to-str 'yellow query))
      query)))

(defn- generate-queries
  "Generate the additional queries to perform a generic pivot table"
  [{{all-breakouts :breakout} :query, :keys [pivot-rows pivot-cols query], :as outer-query}]
  (try
    (for [breakout-indices (u/prog1 (breakout-combinations (count all-breakouts) pivot-rows pivot-cols)
                             (log/tracef "Using breakout combinations: %s" (pr-str <>)))
          :let             [group-bitmask (group-bitmask (count all-breakouts) breakout-indices)
                            new-breakouts (for [i breakout-indices]
                                            (nth all-breakouts i))]]
      (add-grouping-field outer-query new-breakouts group-bitmask))
    (catch Throwable e
      (throw (ex-info (tru "Error generating pivot queries")
                      {:type qp.error-type/qp, :query query}
                      e)))))

(defn- process-query-append-results
  "Reduce the results of a single `query` using `rf` and initial value `init`."
  [query rf init info context]
  (if (a/poll! (qp.context/canceled-chan context))
    (ensure-reduced init)
    (let [context {:canceled-chan (qp.context/canceled-chan context)
                   :rff           (fn [_]
                                    (fn
                                      ([]        init)
                                      ([acc]     acc)
                                      ([acc row] (rf acc ((:row-mapping-fn context) row context)))))}]
      (try
        (if info
          (qp/process-userland-query-sync (assoc query :info info) context)
          (qp/process-query-sync (dissoc query :info) context))
        (catch Throwable e
          (log/error e (trs "Error processing additional pivot table query"))
          (throw e))))))

(defn- process-queries-append-results
  "Reduce the results of a sequence of `queries` using `rf` and initial value `init`."
  [queries rf init info context]
  (reduce
   (fn [acc query]
     (process-query-append-results query rf acc info (assoc context
                                                            :pivot-column-mapping ((:column-mapping-fn context) query))))
   init
   queries))

(defn- append-queries-context
  "Update Query Processor `context` so it appends the rows fetched when running `more-queries`."
  [info context more-queries]
  (cond-> context
    (seq more-queries)
    (update :rff (fn [rff]
                   (fn [metadata]
                     (let [rf (rff metadata)]
                       (fn
                         ([]        (rf))
                         ([acc]     (rf (process-queries-append-results more-queries rf acc info context)))
                         ([acc row] (rf acc row)))))))))

(defn process-multiple-queries
  "Allows the query processor to handle multiple queries, stitched together to appear as one"
  [[first-query & more-queries] info context]
  (let [context (append-queries-context info context more-queries)]
    (if info
      (qp/process-query-and-save-with-max-results-constraints! first-query info context)
      (qp/process-query (dissoc first-query :info) context))))

(defn run-pivot-query
  "Run the pivot query. Unlike many query execution functions, this takes `context` as the first parameter to support
   its application via `partial`.

   You are expected to wrap this call in `qp.streaming/streaming-response` yourself."
  ([query]
   (run-pivot-query query nil))
  ([query info]
   (run-pivot-query query info nil))
  ([query info context]
   (binding [qp.perms/*card-id* (get info :card-id)]
     (qp.store/with-store
       (let [context                 (merge (context.default/default-context) context)
             query                   (mbql.normalize/normalize query)
             main-breakout           (:breakout (:query query))
             col-determination-query (add-grouping-field query main-breakout 0)
             all-expected-cols       (qp/query->expected-cols col-determination-query)
             all-queries             (generate-queries query)]
         (process-multiple-queries
          all-queries
          info
          (assoc context
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
                                     row)))))))))
