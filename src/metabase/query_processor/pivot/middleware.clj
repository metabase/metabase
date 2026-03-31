(ns metabase.query-processor.pivot.middleware
  "Query Processor post-processing middleware responsible for massaging Pivot QP ([[metabase.query-processor.pivot]])
  (sub)query results into the correct shape."
  (:refer-clojure :exclude [empty? mapv])
  (:require
   [medley.core :as m]
   [metabase.query-processor.pivot.common :as pivot.common]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf :refer [empty? mapv]]))

(def ^:private pivot-column-gropuing-metadata
  {:name                     "pivot-grouping"
   :display_name             "pivot-grouping"
   :lib/desired-column-alias "pivot-grouping"
   :base_type                :type/Integer
   :effective_type           :type/Integer})

(defn- add-column-grouping-metadata [cols num-breakouts]
  (vec
   (concat
    (take num-breakouts cols)
    [pivot-column-gropuing-metadata]
    (drop num-breakouts cols))))

(defn add-pivot-grouping
  "For queries ran by the Pivot QP ([[metabase.query-processor.pivot]]):

  * Splice the [[pivot-column-grouping-metadata]] into the column metadata; this is spliced in after all the other
  breakouts. Note that this really only matters for the first query since calculated metadata for additional queries is
  discarded.

  * Splice the [[metabase.query-processor.pivot.common/group-bitmask]] into each row in the same position as the pivot
    column grouping metadata."
  [{unremapped-breakout-combination :qp.pivot/unremapped-breakout-combination
    num-remapped-breakouts          :qp.pivot/num-remapped-breakouts
    num-unremapped-breakouts        :qp.pivot/num-unremapped-breakouts
    :as                             _subquery}
   rff]
  (if-not unremapped-breakout-combination
    rff
    (fn rff' [metadata]
      (let [metadata'     (m/update-existing metadata :cols add-column-grouping-metadata num-remapped-breakouts)
            rf            (rff metadata')
            group-bitmask (pivot.common/group-bitmask num-unremapped-breakouts unremapped-breakout-combination)
            xform         (map (fn [row]
                                 (vec
                                  (concat
                                   (take num-remapped-breakouts row)
                                   [group-bitmask]
                                   (drop num-remapped-breakouts row)))))]
        (xform rf)))))

;; this is mainly for documentation purposes
(mr/def ::row
  [:sequential :any])

(mr/def ::pivot-column-mapping
  "Something like `[nil 0 1 2]` or `[0 nil 1 2]`, this represents how to
  expand out the columns in a subquery to match those in the full original query.

  * `nil` = the column originally at this index does not exist in this subquery, fill with `nil`

  * a number = the column originally at this index is at <number> in the subquery

  Normally you get this by calling a `::column-mapping-fn` with a query."
  [:sequential [:maybe ::pivot.common/index]])

(mu/defn- column-mapping-for-subquery :- ::pivot-column-mapping
  [{num-remapped-cols      :qp.pivot/num-remapped-cols
    num-remapped-breakouts :qp.pivot/num-remapped-breakouts
    :as                    _subquery} :- [:map
                                          [:qp.pivot/num-remapped-cols      nat-int?]
                                          [:qp.pivot/num-remapped-breakouts ::pivot.common/num-breakouts]]
   subquery-breakout-combination :- ::pivot.common/breakout-combination]
  ;; all pivot queries consist of *breakout columns* + *other columns*. Breakout columns are always first, and the only
  ;; thing that can change between subqueries. The other columns will always be the same, and in the same order.
  (let [ ;; First, let's build a map of the canonical column index to the index in the current subquery. To build the
        ;; map, we build it in two parts:
        canonical-index->subquery-index
        (merge
         ;; 1. breakouts remapping, based on the `:qp.pivot/remapped-breakout-combination`
         (into {}
               (map (fn [[subquery-index canonical-index]]
                      [canonical-index subquery-index]))
               (m/indexed subquery-breakout-combination))
         ;; 2. other columns remapping, which just takes the other columns offset in the subquery and moves that column
         ;;    so it matches up with the position it is in the canonical query.
         (let [canonical-other-columns-offset num-remapped-breakouts
               subquery-other-columns-offset  (count subquery-breakout-combination)
               num-other-columns              (- num-remapped-cols num-remapped-breakouts)]
           (into {}
                 (map (fn [i]
                        [(+ canonical-other-columns-offset i) (+ subquery-other-columns-offset i)]))
                 (range num-other-columns))))]
    ;; e.g.
    ;;
    ;;    ;; column 1 in the subquery results corresponds to 2 in the canonical results, 3 corresponds to 0
    ;;    {1 2, 3 0}
    ;;
    ;; next, let's use that map to make a vector of like
    ;;
    ;;    [nil 2 nil 0]
    ;;
    ;; e.g.
    ;;
    ;; * canonical column 0 has no corresponding column in the subquery
    ;; * canonical column 2 corresponds to subquery column 1
    (mapv (fn [i]
            (get canonical-index->subquery-index i))
          (range num-remapped-cols))))

(mu/defn- full-breakout-combination :- ::pivot.common/breakout-combination
  "Returns the breakout combination corresponding to `breakout-combination` belonging to the base query (the one without
  remapped fields) accounting for the field remapping specified by `remap`.

  To produce the breakout combination for the real query, the target indexes have to be included whenever a source
  index is selected, we have to shift the indexes before which a mapped index is inserted."
  [{breakout-combination :qp.pivot/remapped-breakout-combination
    remap                :qp.pivot/remapped-indexes
    :as                  _subquery} :- [:map
                                        [:qp.pivot/remapped-breakout-combination ::pivot.common/breakout-combination]
                                        [:qp.pivot/remapped-indexes              ::pivot.common/remapped-indexes]]]
  (if (or (empty? remap)
          (empty? breakout-combination))
    breakout-combination
    (let [limit    (apply max breakout-combination)
          selected (set breakout-combination)
          inserted (set (vals remap))]
      (loop [index 0, offset 0, combination #{}]
        (if (> index limit)
          (-> combination sort vec)
          (let [offset        (cond-> offset
                                (inserted (+ index offset)) inc)
                spliced-index (+ index offset)
                selected?     (selected index)
                mapped-index  (when selected?
                                (remap spliced-index))]
            (recur (inc index)
                   offset
                   (cond-> combination
                     selected?    (conj spliced-index)
                     mapped-index (into (take-while some? (iterate remap mapped-index)))))))))))

(mu/defn- column-mapping [subquery :- :map]
  (let [full-breakout-combination (full-breakout-combination subquery)]
    (column-mapping-for-subquery subquery full-breakout-combination)))

(mu/defn- row-mapping-fn :- [:=> [:cat ::row] ::row]
  "This function needs to be called for each row so that it can actually shape the row according to the
  `column-mapping-fn` we build at the beginning.

  Row mapping function is a function that can reorder the row and add `nil`s for columns that aren't present in a
  particular subquery, with the signature

    (f row) => row'

  e.g.

    (f [1 2 3]) => [2 nil 3 nil 1]"
  [subquery]
  (perf/juxt* (for [mapping (column-mapping subquery)]
                (if (nat-int? mapping)
                  #(nth % mapping)
                  (constantly nil)))))

(defn project-pivot-subquery-rows
  "For Pivot QP subqueries, adjust the shape of the rows to match the shape of rows in the original query, splicing in
  `nil` values as needed."
  [query rff]
  (if-not (:qp.pivot/remapped-breakout-combination query)
    rff
    (fn rff' [metadata]
      (let [rf             (rff metadata)
            row-mapping-fn (row-mapping-fn query)
            xform          (map row-mapping-fn)]
        (xform rf)))))
