(ns metabase.query-processor.pivot.common
  (:refer-clojure :exclude [empty?])
  (:require
   [clojure.math :as math]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [empty?]]))

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

(mu/defn full-breakout-combination :- ::breakout-combination
  "Returns the breakout combination corresponding to `breakout-combination` belonging to the base query (the one without
  remapped fields) accounting for the field remapping specified by `remap`.

  To produce the breakout combination for the real query, the target indexes have to be included whenever a source
  index is selected, we have to shift the indexes before which a mapped index is inserted."
  [{breakout-combination :qp.pivot/remapped-breakout-combination
    remap                :qp.pivot/remapped-indexes
    :as                  _subquery} :- [:map
                                        [:qp.pivot/remapped-breakout-combination ::breakout-combination]
                                        [:qp.pivot/remapped-indexes              ::remapped-indexes]]]
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
