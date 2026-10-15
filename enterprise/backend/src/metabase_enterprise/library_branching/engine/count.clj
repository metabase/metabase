(ns metabase-enterprise.library-branching.engine.count
  "The count of a snapshot by kind."
  (:require
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(defn count-by-kind
  "`{kind n}`: the number of items of each kind in snapshot `s`, with 0 for each kind of `kinds` (default
  [[snapshot/kinds]]) that has no item in `s`."
  ([s]
   (count-by-kind s snapshot/kinds))
  ([s kinds]
   (merge (zipmap kinds (repeat 0))
          (frequencies (map :kind (vals s))))))
