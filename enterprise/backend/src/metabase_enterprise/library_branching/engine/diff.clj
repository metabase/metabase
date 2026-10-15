(ns metabase-enterprise.library-branching.engine.diff
  "The difference of two snapshots, by content equality.")

(set! *warn-on-reflection* true)

(defn diff
  "`{:created :deleted :updated}`, sets of identities: the items of snapshot `y` that `x` does not have, the items of
  `x` that `y` does not have, and the items of both whose contents are not equal values."
  [x y]
  {:created (set (remove (partial contains? x) (keys y)))
   :deleted (set (remove (partial contains? y) (keys x)))
   :updated (set (filter (fn [id] (and (contains? y id) (not= (get x id) (get y id)))) (keys x)))})
