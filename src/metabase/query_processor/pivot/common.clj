(ns metabase.query-processor.pivot.common
  (:require
   [clojure.math :as math]
   [metabase.lib.options :as lib.options]
   ;; :as-alias only, for ::add-remaps keywords; no runtime dependency on middleware internals
   ^{:clj-kondo/ignore [:metabase/modules]}
   [metabase.query-processor.middleware.add-remaps :as-alias add-remaps]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

;;; these defs are just for readability, even tho they're all just ints >= 0
(mr/def ::bitmask       nat-int?)
(mr/def ::num-breakouts nat-int?)
(mr/def ::index         nat-int?)

(mr/def ::breakout-combination
  [:sequential ::index])

(mr/def ::remapped-indexes
  [:map-of ::index ::index])

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
                                                           (get ::add-remaps/new-field-dimension-id))]
                                       [dim-id i])))
                                  breakouts)]
    (into {}
          (keep-indexed
           (fn [orig-pos b]
             (when-let [dim-id (-> b lib.options/options
                                   (get ::add-remaps/original-field-dimension-id))]
               (when-let [new-pos (get new-field-by-dim-id dim-id)]
                 [orig-pos new-pos]))))
          breakouts)))

(defn non-remap-positions
  "Indices in `breakouts` of the breakouts that are NOT remap new-field breakouts, in original order."
  [breakouts]
  (into []
        (keep-indexed
         (fn [i b]
           (when-not (-> b lib.options/options (get ::add-remaps/new-field-dimension-id))
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
