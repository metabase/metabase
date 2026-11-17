(ns metabase.parameters.chain-filter.dedupe-joins
  (:require
   [clojure.set :as set]
   [metabase.util.log :as log]))

(def ^:private source-node (comp :table :lhs))

(def ^:private target-node (comp :table :rhs))

(def ^:private edge-nodes (juxt source-node target-node))

(defn- weight
  [terminal-ids edge]
  (let [[s e] (edge-nodes edge)]
    (+ (if (terminal-ids s) 0 1)
       (if (terminal-ids e) 0 1))))

(defn- node-degrees
  "Return a map from the nodes in `nodes` to their degree in the graph with `edges`.
  The degree of a node is the number of edges incident to it. A loop edge contributes 2 to the degree.
  Nodes without any edges are not included in the map."
  [nodes edges]
  (reduce (fn [degrees edge]
            (reduce #(update %1 %2 (fnil inc 0))
                    degrees
                    (filter nodes (edge-nodes edge))))
          {}
          edges))

(defn- make-tree
  "Return a subset of `edges` forming a tree starting from node `source-id` and
  containing all nodes in `terminal-ids`.
  The tree is built greedily, there is no guarantee that we find the optimal one."
  [source-id edges terminal-ids]
  (loop [s #{source-id}, edges edges, tree-edges []]
    (if (set/subset? terminal-ids s)
      tree-edges
      (if-let [out-edges (seq (filter (comp s source-node) edges))]
        (let [edge (apply min-key #(weight terminal-ids %) out-edges)
              s' (conj s (target-node edge))]
          (recur s'
                 (remove (comp s' target-node) edges)
                 (conj tree-edges edge)))
        tree-edges))))

(defn- forced-nodes
  "Return the transitive closure of nodes reachable from `start-nodes` by a single edge only.
  `node-fn` selects the target node of an edge returned by `node->edges`.  `node->edges` is a function returning the
  edges going from a node. (Note that source and target nodes can be both lhs and rhs tables depending on `node-fn`
  and `node->edges`.)"
  [node-fn start-nodes node->edges]
  (loop [[node & nodes] start-nodes, result start-nodes]
    (if (nil? node)
      result
      (let [[edge & more] (node->edges node)]
        (if (or (nil? edge) (seq more))
          (recur nodes result)
          (let [next-node (node-fn edge)]
            (recur (cons next-node nodes) (conj result next-node))))))))

(defn- prefer-requested-fks
  "Pick one edge from a group of parallel edges between the same source/target tables. Two independent preference
  signals, consulted in order:

  1. `preferred-fk-pairs` — unordered `#{lhs rhs}` pairs the caller knows the expanded query already uses. An exact
     pair match is the strongest signal.
  2. `preferred-fk-ids` — field-ids the caller wants to see on at least one endpoint (e.g. a parameter target
     already bound to the FK itself, as in #65838).

  If neither signal yields exactly one winner, log quietly and pick deterministically from whatever shortlist we
  have."
  [preferred-fk-ids preferred-fk-pairs edges]
  (if (<= (count edges) 1)
    (first edges)                       ; Edges should not be empty. We return nil if it is.
    (let [exact (filter (fn [{{lhs :field} :lhs {rhs :field} :rhs}]
                          (contains? preferred-fk-pairs #{lhs rhs}))
                        edges)
          by-id (filter (fn [{{lhs :field} :lhs {rhs :field} :rhs}]
                          (or (preferred-fk-ids lhs) (preferred-fk-ids rhs)))
                        edges)
          choices (or (seq exact) (seq by-id) edges)]
      (if (= (count choices) 1)
        (first choices)
        (do (log/debugf "Could not choose between multiple FKs for a chain filters join. %d edges, %d candidates"
                        (count edges) (count choices))
            (first choices))))))

(defn dedupe-joins
  "Remove unnecessary joins from a collection of `in-joins`.

  `keep-ids` = the IDs of Tables that we want to keep joins for. Joins that are not needed to keep these Tables may be
  removed.
  `field-ids` = field-ids the caller wants to see on at least one endpoint of a parallel edge (parameter-bound-to-FK
  case from #65838).
  `fk-pairs` = unordered `#{lhs rhs}` pairs the caller knows the expanded query already uses. An exact match wins
  over a field-id match when both signals are available."
  [source-id field-ids fk-pairs in-joins keep-ids]
  (let [;; Group up any parallel edges, and choose one from each group.
        edges     (-> (group-by edge-nodes in-joins)
                      (update-vals #(prefer-requested-fks field-ids fk-pairs %))
                      vals)
        out-edges (group-by source-node edges)
        in-edges  (group-by target-node edges)
        ;; Collect the IDs that must be included either way to prefer them
        ;; during the construction of the tree.
        transitive-keep-ids (forced-nodes source-node keep-ids in-edges)
        transitive-source-ids (forced-nodes target-node #{source-id} out-edges)
        terminal-ids (set/union transitive-source-ids transitive-keep-ids)
        tree (make-tree source-id edges terminal-ids)
        ;; The tree might contain nodes we don't need: any non-terminal node with degree less than 2 is redundant.
        intermediate-ids (into #{}
                               (comp (mapcat edge-nodes)
                                     (remove terminal-ids))
                               edges)
        degrees (node-degrees intermediate-ids tree)
        redundant-nodes (into #{} (keep (fn [[n d]] (when (< d 2) n))) degrees)]
    ;; Return the tree with edges incident to redundant nodes removed.
    (into [] (remove #(some redundant-nodes (edge-nodes %))) tree)))
