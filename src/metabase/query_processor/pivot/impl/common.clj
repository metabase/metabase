(ns metabase.query-processor.pivot.impl.common
  "Things shared by both the [[metabase.query-processor.pivot.impl.legacy]]
  and [[metabase.query-processor.pivot.impl.new]] implementations."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn powerset
  "Generate a powerset while maintaining the original ordering as much as possible"
  [xs]
  (for [combo (reverse (range (int (Math/pow 2 (count xs)))))]
    (for [item  (range 0 (count xs))
          :when (not (zero? (bit-and (bit-shift-left 1 item) combo)))]
      (nth xs item))))

;;; these defs are just for readability, even tho they're all just ints > 0
(mr/def ::bitmask       ::lib.schema.common/int-greater-than-or-equal-to-zero)
(mr/def ::num-breakouts ::lib.schema.common/int-greater-than-or-equal-to-zero)
(mr/def ::index         ::lib.schema.common/int-greater-than-or-equal-to-zero)

(mr/def ::pivot-rows [:sequential ::index])
(mr/def ::pivot-cols [:sequential ::index])

(mu/defn group-bitmask :- ::bitmask
  "Come up with a display name given a combination of breakout `indexes` e.g.

  This is basically a bitmask of which breakout indexes we're excluding, but reversed. Why? This is how Postgres and
  other DBs determine group numbers. This implements basically what PostgreSQL does for grouping -- look at the original
  set of groups - if that column is part of *this* group, then set the appropriate bit (entry 1 sets bit 1, etc)

    (group-bitmask 3 [1])   ; -> [_ 1 _] -> 101 -> 101 -> 5
    (group-bitmask 3 [1 2]) ; -> [_ 1 2] -> 100 -> 011 -> 1"
  [num-breakouts :- ::num-breakouts
   indexes       :- [:sequential ::index]]
  (transduce
   (map (partial bit-shift-left 1))
   (completing bit-xor)
   (int (dec (Math/pow 2 num-breakouts)))
   indexes))

(mr/def ::breakout-combination
  [:sequential ::index])

(mr/def ::breakout-combinations
  [:and
   [:sequential ::breakout-combination]
   [:fn
    {:error/message "Distinct combinations"}
    #(or (empty? %)
         (apply distinct? %))]])

(mu/defn breakout-combinations :- ::breakout-combinations
  "Return a sequence of all breakout combinations (by index) we should generate queries for.

    (breakout-combinations 3 [1 2] nil) ;; -> [[0 1 2] [] [1 2] [2] [1]]"
  [num-breakouts :- ::num-breakouts
   pivot-rows    :- [:maybe ::pivot-rows]
   pivot-cols    :- [:maybe ::pivot-cols]]
  ;; validate pivot-rows/pivot-cols
  (doseq [[k pivots] [[:pivot-rows pivot-rows]
                      [:pivot-cols pivot-cols]]
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

(mu/defn add-pivot-group-breakout :- ::lib.schema/query
  "Add the grouping field and expression to the query"
  [query   :- ::lib.schema/query
   bitmask :- ::bitmask]
  (as-> query query
    ;;TODO: replace this value with a bitmask or something to indicate the source better
    (lib/expression query -1 "pivot-grouping" (lib/abs bitmask) {:add-to-fields? false})
    ;; in PostgreSQL and most other databases, all the expressions must be present in the breakouts. Add a pivot
    ;; grouping expression ref to the breakouts
    (lib/breakout query (lib/expression-ref query "pivot-grouping"))
    (do
      (log/tracef "Added pivot-grouping expression to query\n%s" (u/pprint-to-str 'yellow query))
      query)))

(mu/defn remove-non-aggregation-order-bys :- ::lib.schema/query
  "Only keep existing aggregations in `:order-by` clauses from the query. Since we're adding our own breakouts (i.e.
  `GROUP BY` and `ORDER BY` clauses) to do the pivot table stuff, existing `:order-by` clauses probably won't work --
  `ORDER BY` isn't allowed for fields that don't appear in `GROUP BY`."
  [query :- ::lib.schema/query]
  (reduce
   (fn [query [_tag _opts expr :as order-by]]
     ;; keep any order bys on :aggregation references. Remove all other clauses.
     (cond-> query
       (not (lib.util/clause-of-type? expr :aggregation))
       (lib/remove-clause order-by)))
   query
   (lib/order-bys query)))

(defmulti run-pivot-query
  "Implementation for [[metabase.query-processor.pivot/run-pivot-query]]. Run a pivot query using the appropriate
  implementation for the current driver."
  {:arglists '([impl-name query rff]), :added "0.51.0"}
  (fn [impl-name _query _rff]
    (keyword impl-name)))
