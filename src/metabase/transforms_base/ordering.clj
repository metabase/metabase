(ns metabase.transforms-base.ordering
  "Pure graph algorithms for transform ordering — no appdb dependencies."
  (:require
   [clojure.set :as set]
   [flatland.ordered.set :refer [ordered-set]]))

(defn find-cycle
  "Finds a path containing a cycle in the directed graph `node->children`.

  Optionally takes a set of starting nodes.  If starting nodes are specified, `node->children` can be any
  function-equivalent.  Without starting nodes, `node->children` must specifically be a map."
  ([node->children]
   (find-cycle node->children (keys node->children)))
  ([node->children starting-nodes]
   (loop [stack (into [] (map #(vector % (ordered-set))) starting-nodes)
          visited #{}]
     (when-let [[node path] (peek stack)]
       (cond
         (contains? path node)
         (into [] (drop-while (complement #{node})) (conj path node))

         (contains? visited node)
         (recur (pop stack) visited)

         :else
         (let [path' (conj path node)
               stack' (into (pop stack)
                            (map #(vector % path'))
                            (node->children node))]
           (recur stack' (conj visited node))))))))

(defn available-transforms
  "Given an ordering (see transform-ordering), a set of running transform ids, and a set of completed transform ids,
  computes which transforms are currently able to be run.  Returns transform ids in the order that they appear in the
  ordering map.  If you want them returned in a specific order, use a map with ordered keys, e.g., a sorted-map."
  [ordering running complete]
  (for [[transform-id deps] ordering
        :when (and (not (or (running transform-id)
                            (complete transform-id)))
                   (empty? (set/difference deps complete)))]
    transform-id))
