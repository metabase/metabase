(ns dev.module-cuts
  "Where the module graph could be cut next, from one commit's dependency rows.

  [[dev.module-history-report]] writes both tables for the latest commit it measures."
  (:require
   [dev.deps-graph :as deps-graph]
   [dev.module-graph :as module-graph]))

(set! *warn-on-reflection* true)

(defn upward-pairs
  "Module and ancestor pairs whose upward requires close a cycle, the pair with the most requires first.
  Each is `{:module, :ancestor, :requires, :internal}`: how many requires go from the module into that ancestor,
  and how many of those reach past the ancestor's `:api`."
  [deps modules]
  (->> (deps-graph/upward-references deps modules)
       (filter :cycle?)
       (group-by (juxt :module :ancestor))
       (map (fn [[[module ancestor] requires]]
              {:module   module
               :ancestor ancestor
               :requires (count requires)
               :internal (count (remove :api? requires))}))
       (sort-by (juxt (comp - :requires) (comp str :module) (comp str :ancestor)))
       vec))

;;;; Cut candidates

(defn- requires-by-edge
  "The namespace requires behind each module edge: `{[from to] [[from-namespace to-namespace] ...]}`."
  [deps]
  (reduce (fn [edges {:keys [namespace module], requires :deps}]
            (reduce (fn [edges {to-namespace :namespace, to :module}]
                      (if (and to (not= module to))
                        (update edges [module to] (fnil conj []) [namespace to-namespace])
                        edges))
                    edges
                    requires))
          {}
          deps))

(defn- largest-cycle
  "The modules of the cycle of `graph` that holds the most namespaces, or nil without a cycle."
  [graph size]
  (when-let [cycles (seq (module-graph/cyclic-components graph))]
    (apply max-key size cycles)))

(defn- largest-remnant
  "The modules of the largest cycle of `graph` left inside `cycle`, or nil when none is."
  [graph cycle size]
  (largest-cycle (into {} (map (fn [module] [module (into #{} (filter cycle) (graph module))])) cycle) size))

(defn- bottom-up
  "The modules of one `cycle`, ordered so that few requires point from an earlier module to a later one: roughly
  what the cycle would look like as layers, the most depended-upon first. `weight` is the number of requires
  behind an edge."
  ;; Eades, Lin and Smyth's greedy heuristic for a small feedback arc set: take modules that require nothing left
  ;; to the bottom and modules nothing left requires to the top, and otherwise the one that gives up the fewest
  ;; requires by going to the bottom.
  [cycle graph weight]
  (let [inside (fn [module] (filter cycle (graph module)))]
    (loop [left   (set cycle)
           bottom []
           top    ()]
      (if (empty? left)
        (vec (concat bottom top))
        (let [out     (fn [module] (transduce (comp (filter left) (map #(weight [module %]))) + 0 (inside module)))
              in      (fn [module] (transduce (comp (filter #(some #{module} (inside %))) (map #(weight [% module])))
                                              +
                                              0
                                              left))
              sinks   (filter #(zero? (out %)) left)
              sources (filter #(zero? (in %)) left)]
          (cond
            (seq sinks)   (recur (apply disj left sinks) (into bottom (sort-by str sinks)) top)
            (seq sources) (recur (apply disj left sources) bottom (concat (sort-by str sources) top))
            :else         (let [module (apply min-key #(- (out %) (in %)) (sort-by str left))]
                            (recur (disj left module) (conj bottom module) top))))))))

(defn cut-candidates
  "Ways to shrink the largest module cycle by splitting it into a lower and an upper layer.
  Each candidate takes the bottom `:base-modules` of the cycle's `:cycle-modules`, in [[bottom-up]] order, as the
  lower layer and severs every require from it into the rest of the cycle:

      {:base-modules 44, :cycle-modules 53, :requires [[from-namespace to-namespace] ...],
       :largest-after 681, :freed 113}

  `:largest-after` is the namespaces in the largest cycle left among those modules once the requires are gone,
  and `:freed` how many fewer that is.
  Other cycles of the graph are not looked at.
  Returns the candidates of at most `max-requires` requires that no other beats on both counts, fewest requires
  first.
  Empty when there is no cycle."
  [deps max-requires]
  (let [requires (requires-by-edge deps)
        counts   (frequencies (keep :module deps))
        size     (fn [modules] (transduce (map #(counts % 0)) + 0 modules))
        graph    (reduce (fn [graph [from to]] (update graph from (fnil conj #{}) to))
                         (zipmap (keys counts) (repeat #{}))
                         (keys requires))
        cycle    (largest-cycle graph size)]
    (if-not cycle
      []
      (let [before (size cycle)
            order  (bottom-up cycle graph #(count (requires %)))]
        (->> (for [n     (range 1 (count order))
                   :let  [base    (set (take n order))
                          severed (for [from base
                                        to   (graph from)
                                        :when (and (cycle to) (not (base to)))]
                                    [from to])
                          cut     (into [] (mapcat requires) severed)]
                   :when (<= 1 (count cut) max-requires)
                   :let  [after (size (largest-remnant (reduce (fn [graph [from to]] (update graph from disj to))
                                                               graph
                                                               severed)
                                                       cycle
                                                       size))]]
               {:base-modules  n
                :cycle-modules (count order)
                :requires      cut
                :largest-after after
                :freed         (- before after)})
             (sort-by (juxt (comp count :requires) (comp - :freed)))
             ;; Keep a candidate only when it frees more than every cheaper one. One that frees nothing is never kept.
             (reduce (fn [kept candidate]
                       (if (> (:freed candidate) (:freed (peek kept) 0))
                         (conj kept candidate)
                         kept))
                     []))))))
