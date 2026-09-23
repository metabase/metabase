(ns metabase.query-processor.pivot.common
  (:refer-clojure :exclude [empty?])
  (:require
   [clojure.math :as math]
   [medley.core :as m]
   [metabase.lib.options :as lib.options]
   [metabase.query-processor.error-type :as qp.error-type]
   ^{:clj-kondo/ignore [:metabase/modules]}
   [metabase.query-processor.middleware.add-remaps :as-alias add-remaps]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [empty?]]))

(set! *warn-on-reflection* true)

;;; these defs are just for readability, even tho they're all just ints >= 0
(mr/def ::bitmask       nat-int?)
(mr/def ::num-breakouts nat-int?)
(mr/def ::index         nat-int?)

(mr/def ::breakout-combination
  [:sequential ::index])

(mr/def ::remapped-indexes
  [:map-of ::index ::index])

(mr/def ::pivot-rows     [:sequential ::index])
(mr/def ::pivot-cols     [:sequential ::index])
(mr/def ::pivot-measures [:sequential ::index])

(mr/def ::breakout-combinations
  [:and
   [:sequential ::breakout-combination]
   [:fn
    {:error/message "Distinct combinations"}
    #(or (empty? %)
         (apply distinct? %))]])

(mu/defn group-bitmask :- ::bitmask
  "Calculate the value of the `pivot-grouping` column we add to Pivot QP results in post-processing
  in [[metabase.query-processor.pivot.middleware]].

  This is basically a bitmask of which breakout indexes we're excluding, but reversed. Why? This is how Postgres and
  other DBs determine group numbers. This implements basically what PostgreSQL does for grouping -- look at the
  original set of groups - if that column is part of *this* group, then set the appropriate bit (entry 1 sets bit 1,
  etc)

    (group-bitmask 3 [1])   ; -> [_ 1 _] -> 101 -> 101 -> 5
    (group-bitmask 3 [1 2]) ; -> [_ 1 2] -> 100 -> 011 -> 1"
  [num-breakouts :- ::num-breakouts
   indexes       :- [:sequential ::index]]
  (transduce
   (map (partial bit-shift-left 1))
   (completing bit-xor)
   (long (dec (math/pow 2 num-breakouts)))
   indexes))

(defn- powerset
  "Generate a powerset while maintaining the original ordering as much as possible"
  [xs]
  (for [combo (reverse (range (long (Math/pow 2 (count xs)))))]
    (for [item  (range 0 (count xs))
          :when (not (zero? (bit-and (bit-shift-left 1 item) combo)))]
      (nth xs item))))

(mu/defn breakout-combinations :- ::breakout-combinations
  "Return a sequence of all breakout combinations (by index) we should generate queries for.

    (breakout-combinations 3 [1 2] nil) ;; -> [[0 1 2] [] [1 2] [2] [1]]"
  [num-breakouts      :- ::num-breakouts
   pivot-rows         :- [:maybe ::pivot-rows]
   pivot-cols         :- [:maybe ::pivot-cols]
   show-row-totals    :- [:maybe :boolean]
   show-column-totals :- [:maybe :boolean]]
  (let [row-totals (if (nil? show-row-totals)    true show-row-totals)
        col-totals (if (nil? show-column-totals) true show-column-totals)]
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
     (m/distinct-by
      (partial group-bitmask num-breakouts)
      (map
       (comp vec sort)
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
          (when col-totals
            (for [i (range 1 (count pivot-rows))]
              (concat (take i pivot-rows) pivot-cols)))
          ;; "row totals" on the right
          ;; pivotRows
          ;; => [0 1 2 _] => 1000 => Group #8
          (when row-totals
            [pivot-rows])
          ;; subtotal rows within "row totals"
          ;; _.range(1, pivotRows.length).map(i => pivotRow.slice(0, i))
          ;; => [0 _ _ _] [0 1 _ _] => 1110 1100 => Group #14, #12
          (when (and row-totals col-totals)
            (for [i (range 1 (count pivot-rows))]
              (take i pivot-rows)))
          ;; "grand totals" row
          ;; pivotCols
          ;; => [_ _ _ 3] => 0111 => Group #7
          (when col-totals
            [pivot-cols])
          ;; bottom right corner [_ _ _ _] => 1111 => Group #15
          (when (and row-totals col-totals)
            [[]]))))))))

;;; The following helpers deal with `add-remaps` middleware artifacts on `:breakout` clauses: each remapped breakout
;;; splits into a pair (original + new-field) that share a dimension id. Pivot compilers keep grouping-set arithmetic
;;; on the non-remap positions and drag the remap partner along at emit time.

(defn remap-original->new-field-positions
  "Map `original-position` → `new-field-position` for each remap pair in `breakouts` (as produced by the
  `add-remaps` middleware). Returns `{}` when the query has no remapped breakouts."
  [breakouts]
  (let [new-field-by-dim-id (into {}
                                  (keep-indexed
                                   (fn [i b]
                                     (when-let [dim-id (-> b lib.options/options
                                                           ::add-remaps/new-field-dimension-id)]
                                       [dim-id i])))
                                  breakouts)]
    (into {}
          (keep-indexed
           (fn [orig-pos b]
             (when-let [dim-id (-> b lib.options/options
                                   ::add-remaps/original-field-dimension-id)]
               (when-let [new-pos (get new-field-by-dim-id dim-id)]
                 [orig-pos new-pos]))))
          breakouts)))

(defn non-remap-positions
  "Indices in `breakouts` of the breakouts that are NOT remap new-field breakouts, in original order."
  [breakouts]
  (into []
        (keep-indexed
         (fn [i b]
           (when-not (-> b lib.options/options ::add-remaps/new-field-dimension-id)
             i)))
        breakouts))

(defn expand-grouping-combo
  "Map a `combo` of indices into the non-remap-breakouts vector to the corresponding sorted indices into the full
  `breakouts` vector, dragging each remap new-field along with its original via `original->new-field`."
  [combo non-remap-positions original->new-field]
  (sort
   (into #{}
         (mapcat (fn [non-remap-combo-idx]
                   (let [orig-pos (nth non-remap-positions non-remap-combo-idx)]
                     (if-let [new-pos (get original->new-field orig-pos)]
                       [orig-pos new-pos]
                       [orig-pos]))))
         combo)))
