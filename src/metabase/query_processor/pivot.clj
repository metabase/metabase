(ns metabase.query-processor.pivot
  "Pivot table actions for the query processor"
  (:require [clojure.set :refer [map-invert]]))

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
