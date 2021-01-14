(ns metabase.query-processor.pivot
  "Pivot table actions for the query processor"
  (:require [clojure.core.async :as a]
            [clojure.set :refer [map-invert]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.context :as qp.context]
            [metabase.query-processor.store :as qp.store]))

(defn powerset
  "Generate a powerset while maintaining the original ordering as much as possible"
  [xs]
  (for [combo (reverse (range (int (Math/pow 2 (count xs)))))]
    (for [item  (range 0 (count xs))
          :when (not (zero? (bit-and (bit-shift-left 1 item) combo)))]
      (nth xs item))))

(defn- generate-specified-breakouts
  "Generate breakouts specified by pivot_rows"
  [breakouts pivot-rows pivot-cols]
  (let [generator (fn [coll]
                    (for [pivots coll]
                      (map #(nth breakouts %) pivots)))]
    (concat
     [breakouts]
     (generator [pivot-cols])
     (when (and (seq pivot-cols)
                (seq pivot-rows))
       (generator [(concat [(first pivot-rows)] pivot-cols)]))
     (generator (powerset (or pivot-rows
                              ;; this can happen for the public/embed endpoints,
                              ;; where we aren't given a pivot_rows / pivot_cols
                              ;; parameter, so we'll just generate everything
                              (vec (range 0 (count breakouts)))))))))

(defn add-grouping-field
  "Add the grouping field and expression to the query"
  [query breakout bitmask]
  (let [new-query (-> query
                      ;;TODO: `pivot-grouping` is not "magic" enough to mark it as an internal thing
                      (update-in [:query :fields]
                                 #(conj % [:expression "pivot-grouping"]))
                      ;;TODO: replace this value with a bitmask or something to indicate the source better
                      (update-in [:query :expressions]
                                 #(assoc % "pivot-grouping" [:abs bitmask])))]
    ;; in PostgreSQL and most other databases, all the expressions must be present in the breakouts
    (assoc-in new-query [:query :breakout]
              (concat breakout (map (fn [expr] [:expression (name expr)])
                                    (keys (get-in new-query [:query :expressions])))))))

(defn generate-queries
  "Generate the additional queries to perform a generic pivot table"
  [request]
  (let [query                (:query request)
        all-breakouts        (:breakout query)
        bitmask-index        (map-invert (into {} (map-indexed hash-map all-breakouts)))
        new-breakouts        (generate-specified-breakouts all-breakouts
                                                           (:pivot_rows request)
                                                           (:pivot_cols request))
        bitwise-not-truncate (fn [num-bits val]
                               (- (dec (bit-shift-left 1 num-bits)) val))]
    (map (fn [breakout]
           ;; this implements basically what PostgreSQL does for grouping -
           ;; look at the original set of groups - if that column is part of *this*
           ;; group, then set the appropriate bit (entry 1 sets bit 1, etc)
           ;; at the end, perform a bitwise-not with a mask. Doing it manually
           ;; because (bit-not) extends to a Long, and twos-complement and such
           ;; make that messy.
           (let [start-mask (reduce
                             #(bit-or (bit-shift-left 1 %2) %1) 0
                             (map #(get bitmask-index %) breakout))]
             (add-grouping-field request breakout
                                 (bitwise-not-truncate (count all-breakouts) start-mask))))
         new-breakouts)))

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

(defn run-pivot-query
  "Run the pivot query. Unlike many query execution functions, this takes `context` as the first parameter to support
   its application via `partial`.

   You are expected to wrap this call in `qp.streaming/streaming-response` yourself."
  ([query info context]
   (qp.store/with-store
     (let [main-breakout           (:breakout (:query query))
           col-determination-query (add-grouping-field query main-breakout 0)
           all-expected-cols       (qp/query->expected-cols col-determination-query)
           all-queries             (generate-queries query)]
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
