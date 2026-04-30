(ns metabase-enterprise.similarity.graph.pagerank
  "Power-iteration PageRank over a weighted directed graph.

   Inputs come from `edge-loader/load-directed-edges`. The graph is
   materialized as `{:out-edges {node {neighbor weight}} :all-nodes [node ...]}`.
   For per-type scopes (`:card`, `:dashboard`, `:table`) `node` is the bare
   `entity-id`; for the polymorphic `:full` scope it's a `[entity-type
   entity-id]` pair so two entities of different types with the same numeric
   id can't collide.

   Algorithm: classic Brin-Page with damping=0.85, dangling-node uniform
   redistribution, L1 convergence at tolerance 1e-6. Pure-Clojure; ~50 lines
   of math. At ≤50K nodes this is sub-second per iteration; convergence in
   30-50 iterations on real ensemble data. If the PoC graduates and the
   appdb crosses ~250K nodes, swap in JGraphT or a primitive-array
   representation — defer.

   Tiebreak / determinism: `:all-nodes` is a sorted vector so reduction order
   is stable across runs.")

(set! *warn-on-reflection* true)

(defn- node-of
  "Pick the right node identifier for a row given the scope. Per-type scopes
   collapse `[type id]` to just `id` since both endpoints share the type."
  [scope row from?]
  (let [t (if from? (:from_entity_type row) (:to_entity_type row))
        i (if from? (:from_entity_id row)   (:to_entity_id row))]
    (if (= scope :full) [(keyword t) i] i)))

(defn build-graph
  "Materialize the in-memory directed adjacency map from a reducible of edge
   rows. Output keys:

     :out-edges  {node {neighbor weight, ...}}
     :all-nodes  sorted vector of every node seen (sources or targets)
     :scope      passed-through scope (callers know which key shape to use)"
  [reducible-edges scope]
  (let [out-edges (volatile! {})
        all-nodes (volatile! #{})]
    (reduce
     (fn [_ row]
       (let [u (node-of scope row true)
             v (node-of scope row false)
             w (double (:score row))]
         (vswap! all-nodes conj u)
         (vswap! all-nodes conj v)
         (vswap! out-edges update u
                 (fn [prior] (assoc (or prior {}) v
                                    (+ (double (get prior v 0.0)) w))))))
     nil
     reducible-edges)
    {:out-edges @out-edges
     :all-nodes (vec (sort @all-nodes))
     :scope     scope}))

(defn- pagerank-iteration
  "One power-iteration pass. Returns the next score map given the prior."
  [out-edges out-weight all-nodes prior damping]
  (let [n            (count all-nodes)
        teleport     (/ (- 1.0 damping) n)
        ;; Sinks (no out-edges or zero out-weight) redistribute their full
        ;; rank uniformly across all nodes.
        dangle       (reduce (fn [acc u]
                               (if (zero? (double (out-weight u 0.0)))
                                 (+ acc (double (prior u 0.0)))
                                 acc))
                             0.0 all-nodes)
        dangle-share (* damping (/ dangle n))
        seed         (+ teleport dangle-share)
        seeded       (reduce (fn [acc u] (assoc! acc u seed))
                             (transient {})
                             all-nodes)
        ;; Stream outgoing flow: every node's prior rank is divided by its
        ;; out-weight and credited to each neighbor in proportion to edge w.
        contributed  (reduce
                      (fn [acc u]
                        (let [w-u (double (out-weight u 0.0))
                              out (get out-edges u)]
                          (if (or (zero? w-u) (empty? out))
                            acc
                            (let [pr-u (double (prior u 0.0))
                                  factor (* damping (/ pr-u w-u))]
                              (reduce-kv
                               (fn [a v w-uv]
                                 (assoc! a v (+ (double (get a v 0.0))
                                                (* factor (double w-uv)))))
                               acc out)))))
                      seeded
                      all-nodes)]
    (persistent! contributed)))

(defn- l1-delta
  [a b nodes]
  (reduce (fn [acc node]
            (+ acc (Math/abs (- (double (a node 0.0))
                                (double (b node 0.0))))))
          0.0
          nodes))

(defn pagerank
  "Run weighted directed PageRank. Returns
     {:scores {node score} :iterations N :converged? bool}.

   Defaults: damping 0.85, tolerance 1e-6, max-iterations 100. Empty graphs
   short-circuit to an empty score map (no iterations)."
  [{:keys [out-edges all-nodes]}
   & {:keys [damping tolerance max-iterations]
      :or   {damping 0.85 tolerance 1e-6 max-iterations 100}}]
  (let [n (count all-nodes)]
    (if (zero? n)
      {:scores {} :iterations 0 :converged? true}
      (let [out-weight (reduce (fn [acc [u nbrs]]
                                 (assoc acc u (reduce + 0.0 (vals nbrs))))
                               {}
                               out-edges)
            seed       (let [s (/ 1.0 n)]
                         (zipmap all-nodes (repeat s)))]
        (loop [prior seed
               iters 0]
          (let [next-scores (pagerank-iteration out-edges out-weight all-nodes prior damping)
                delta       (l1-delta next-scores prior all-nodes)
                iters'      (inc iters)]
            (if (or (< delta tolerance) (>= iters' max-iterations))
              {:scores     next-scores
               :iterations iters'
               :converged? (< delta tolerance)}
              (recur next-scores iters'))))))))

(defn- node->row
  "Project a graph node back to `[entity_type entity_id]` for persistence.
   Per-type scopes collapse the type from the scope itself."
  [scope node]
  (if (= scope :full)
    [(name (first node)) (long (second node))]
    [(name scope) (long node)]))

(defn ranked-rows
  "Convert a `pagerank` score map to `:model/SimilarityPagerank`-shaped insert
   rows. Sorts by score-desc with deterministic tiebreak (entity-id asc, then
   entity-type asc) and assigns 1-based dense ranks."
  [scores scope now]
  (let [rows (mapv (fn [[node score]]
                     (let [[etype eid] (node->row scope node)]
                       {:scope       (name scope)
                        :entity_type (keyword etype)
                        :entity_id   eid
                        :score       (double score)
                        :computed_at now}))
                   scores)
        sorted (sort-by (juxt #(- (:score %))
                              :entity_id
                              #(name (:entity_type %)))
                        rows)]
    (vec
     (map-indexed (fn [idx row] (assoc row :rank (inc idx)))
                  sorted))))
