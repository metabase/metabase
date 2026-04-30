(ns metabase-enterprise.similarity.graph.louvain
  "Classic Louvain (Blondel et al. 2008) modularity-optimization community
   detection on a weighted undirected graph.

   Two phases iterated to convergence:

     Phase 1 - local moves. For each node in seeded-shuffle order, evaluate
       moving it to each of its neighbors' communities; pick the move that
       maximizes Newman modularity gain. Repeat until no moves in a sweep.
     Phase 2 - graph aggregation. Communities collapse into single nodes.
       Inter-community edges become weighted edges in the new graph;
       intra-community edges become self-loops with double weight (the
       symmetric-adjacency convention `A[u][v] + A[v][u]`).

   Stops when an outer Phase-1 produces zero moves OR modularity gain across
   an outer iteration falls below `:tolerance` OR `:max-outer-iterations` is
   reached.

   Determinism: a seeded `:rng-seed` plus sorted node identifiers and
   `compare`-based tiebreaks make a single JVM run reproducible. Inter-impl
   community-id parity is not promised — tests assert structural properties.

   `centrality` is computed by `within-community-pagerank` running a fresh
   PageRank on each community's induced subgraph (the same Louvain-input
   filter set, no global hubs). This keeps centrality consistent with the
   partition that produced it."
  (:require
   [metabase-enterprise.similarity.graph.pagerank :as pagerank]))

(set! *warn-on-reflection* true)

(defn build-graph
  "Materialize the symmetric weighted adjacency from a reducible of `{:u :v
   :w}` rows (u < v, no self-loops, parallel edges already summed). Returns

     {:nodes      [...sorted...]
      :neighbors  {node {neighbor weight, ...}}
      :strengths  {node Σ-of-incident-weights}
      :total-w-x2 (Σ_uv A_uv = 2m)}"
  [reducible-edges]
  (let [neighbors (volatile! {})
        strengths (volatile! {})]
    (reduce
     (fn [_ {:keys [u v w]}]
       (let [w (double w)]
         (vswap! neighbors update u (fnil assoc {}) v w)
         (vswap! neighbors update v (fnil assoc {}) u w)
         (vswap! strengths update u (fnil + 0.0) w)
         (vswap! strengths update v (fnil + 0.0) w)))
     nil
     reducible-edges)
    (let [nbrs @neighbors
          str* @strengths
          total (reduce + 0.0 (vals str*))]
      {:nodes      (vec (sort (keys nbrs)))
       :neighbors  nbrs
       :strengths  str*
       :total-w-x2 total})))

(defn modularity
  "Newman modularity of `comm-of` on `graph`. Returns 0.0 for empty/zero-weight
   graphs."
  [{:keys [neighbors total-w-x2]} comm-of]
  (let [m2 (double total-w-x2)]
    (if (or (zero? m2) (empty? comm-of))
      0.0
      (let [comm-tot (reduce-kv (fn [acc u nbrs]
                                  (let [cu (comm-of u)
                                        s  (reduce + 0.0 (vals nbrs))]
                                    (update acc cu (fnil + 0.0) s)))
                                {}
                                neighbors)
            comm-in  (reduce-kv (fn [acc u nbrs]
                                  (let [cu (comm-of u)]
                                    (reduce-kv (fn [a v w]
                                                 (if (= cu (comm-of v))
                                                   (update a cu (fnil + 0.0) (double w))
                                                   a))
                                               acc nbrs)))
                                {}
                                neighbors)]
        (reduce + 0.0
                (map (fn [c]
                       (let [in-c  (double (get comm-in c 0.0))
                             tot-c (double (get comm-tot c 0.0))
                             frac  (/ tot-c m2)]
                         (- (/ in-c m2) (* frac frac))))
                     (keys comm-tot)))))))

(defn- seeded-shuffle
  "Fisher-Yates with a seeded `Random`. Returns a vector."
  [^java.util.Random rng coll]
  (let [arr (object-array coll)
        n   (alength arr)]
    (dotimes [i n]
      (let [j   (.nextInt rng (- n i))
            tmp (aget arr i)]
        (aset arr i (aget arr (+ i j)))
        (aset arr (+ i j) tmp)))
    (vec arr)))

(defn- one-sweep!
  "One Phase 1 pass over `order`. Mutates `comm-of` (volatile map node→cid)
   and `comm-tot` (volatile map cid→Σ-strength). Returns moves count."
  [graph comm-of comm-tot order resolution]
  (let [{:keys [neighbors strengths total-w-x2]} graph
        m2 (double total-w-x2)
        moves (volatile! 0)]
    (when (pos? m2)
      (doseq [n order]
        (let [k-n (double (strengths n 0.0))
              cur (get @comm-of n)
              ;; k_n,c — sum of edge weights from n to nodes in community c,
              ;; excluding n itself.
              comm-weights (reduce-kv
                            (fn [acc j w]
                              (if (= j n)
                                acc
                                (let [c (get @comm-of j)]
                                  (assoc acc c (+ (double (get acc c 0.0))
                                                  (double w))))))
                            {}
                            (or (get neighbors n) {}))
              k-cur (double (get comm-weights cur 0.0))]
          (when (pos? k-n)
            ;; Tentatively pull n out of cur.
            (vswap! comm-tot update cur - k-n)
            (let [cur-tot-after (double (get @comm-tot cur 0.0))
                  baseline-gain (- k-cur (/ (* resolution cur-tot-after k-n) m2))
                  [best-c _]
                  (reduce-kv
                   (fn [[bc bg :as out] c k-c]
                     (if (= c cur)
                       out
                       (let [tot-c (double (get @comm-tot c 0.0))
                             gain  (- (double k-c)
                                      (/ (* resolution tot-c k-n) m2))]
                         (cond
                           (> gain bg)              [c gain]
                           (and (= gain bg)
                                (neg? (compare c bc))) [c gain]
                           :else                    out))))
                   [cur baseline-gain]
                   comm-weights)]
              (vswap! comm-tot update best-c (fnil + 0.0) k-n)
              (when (not= best-c cur)
                (vswap! comm-of assoc n best-c)
                (vswap! moves inc)))))))
    @moves))

(defn- phase1!
  "Repeat one-sweep! until no moves in a full pass or `:max-passes` exceeded.
   Returns total moves across all sweeps."
  [graph comm-of comm-tot order resolution max-passes]
  (loop [pass  0
         total 0]
    (let [moved  (long (one-sweep! graph comm-of comm-tot order resolution))
          total' (+ (long total) moved)]
      (if (or (zero? moved) (>= (inc pass) max-passes))
        total'
        (recur (inc pass) total')))))

(defn- aggregate
  "Build the next-level graph: each old community becomes a single node with
   self-loop weight = sum of intra-community edge weights (counted twice in
   the symmetric-adjacency convention) and inter-community edges = sum of
   crossing weights."
  [{:keys [neighbors]} comm-of]
  (let [adj (volatile! {})]
    (doseq [[u nbrs] neighbors
            [v w]    nbrs]
      (let [cu (get comm-of u)
            cv (get comm-of v)]
        (vswap! adj update cu
                (fn [m]
                  (let [m (or m {})]
                    (assoc m cv (+ (double (get m cv 0.0)) (double w))))))))
    (let [adj* @adj
          strengths (into {} (map (fn [[c nbrs]]
                                    [c (reduce + 0.0 (vals nbrs))]))
                          adj*)
          total (reduce + 0.0 (vals strengths))]
      {:nodes      (vec (sort (keys adj*)))
       :neighbors  adj*
       :strengths  strengths
       :total-w-x2 total})))

(defn- compose-partition
  "Compose `partition: orig-node → intermediate-cid` with `layer:
   intermediate-cid → next-cid`."
  [partition layer]
  (into {} (map (fn [[orig inter]]
                  [orig (get layer inter inter)])) partition))

(defn- relabel-dense
  "Map raw community IDs (ints / arbitrary node IDs after aggregation) to
   dense 0..K-1, ordered by first appearance under sorted-key iteration of
   `partition`. Returns `{raw-cid dense-cid}`."
  [partition]
  (let [seen (volatile! [])
        idx  (volatile! {})]
    (doseq [k (sort (keys partition))]
      (let [c (get partition k)]
        (when-not (contains? @idx c)
          (vswap! idx assoc c (count @seen))
          (vswap! seen conj c))))
    @idx))

(defn louvain
  "Run modularity-optimization Louvain. Returns `{:partition {orig-node
   community-id} :modularity Q :iterations N}`. Community IDs are dense
   0..K-1, assigned in first-appearance order under sorted-key iteration."
  [graph & {:keys [rng-seed tolerance max-outer-iterations resolution
                   max-inner-passes]
            :or   {rng-seed 42 tolerance 1e-6 max-outer-iterations 10
                   resolution 1.0 max-inner-passes 100}}]
  (let [orig-nodes (:nodes graph)]
    (if (empty? orig-nodes)
      {:partition {} :modularity 0.0 :iterations 0}
      (loop [outer        0
             current      graph
             partition    (zipmap orig-nodes orig-nodes)
             prior-q      nil]
        (let [{:keys [nodes strengths]} current
              comm-of  (volatile! (zipmap nodes nodes))
              comm-tot (volatile! (into {} strengths))
              rng      (java.util.Random. (long (+ (long rng-seed) outer)))
              order    (seeded-shuffle rng nodes)
              moves    (phase1! current comm-of comm-tot order resolution
                                max-inner-passes)
              co-final @comm-of
              new-part (compose-partition partition co-final)
              q        (modularity current co-final)
              done?    (or (zero? moves)
                           (and prior-q (< (- q (double prior-q)) tolerance))
                           (>= (inc outer) max-outer-iterations))]
          (if done?
            (let [relabel  (relabel-dense new-part)
                  relabeled (into {} (map (fn [[k v]] [k (get relabel v 0)])) new-part)]
              {:partition  relabeled
               :modularity q
               :iterations (inc outer)})
            (recur (inc outer)
                   (aggregate current co-final)
                   new-part
                   q)))))))

(defn within-community-pagerank
  "For each community of size ≥ 3, run PageRank on its induced undirected
   subgraph (each undirected edge maps to two directed edges of the same
   weight; same edges Louvain saw). Communities of size 1 or 2 get
   `centrality = 1/size`. Returns `{node centrality}`."
  [{:keys [neighbors]} partition]
  (let [by-comm (reduce-kv (fn [acc node cid]
                             (update acc cid (fnil conj []) node))
                           {}
                           partition)]
    (reduce-kv
     (fn [acc _cid members]
       (let [members-set (set members)
             size        (count members-set)]
         (cond
           (= size 1)
           (assoc acc (first members) 1.0)

           (= size 2)
           (let [[a b] (vec members-set)]
             (-> acc (assoc a 0.5) (assoc b 0.5)))

           :else
           (let [out-edges (reduce
                            (fn [m n]
                              (let [nbrs (or (get neighbors n) {})
                                    in-c (reduce-kv
                                          (fn [a v w]
                                            (if (and (contains? members-set v)
                                                     (not= v n))
                                              (assoc a v (double w))
                                              a))
                                          {}
                                          nbrs)]
                                (assoc m n in-c)))
                            {}
                            members)
                 sub-graph {:out-edges out-edges
                            :all-nodes (vec (sort members-set))
                            :scope     :__within-community__}
                 {:keys [scores]} (pagerank/pagerank sub-graph
                                                     :max-iterations 50)]
             (reduce-kv assoc acc scores)))))
     {}
     by-comm)))

(defn community-rows
  "Convert a Louvain partition + per-node centrality into
   `:model/SimilarityCommunity`-shaped rows. `community_id` is the (already
   dense 0..K-1) value from `partition`."
  [partition centrality scope now]
  (vec
   (map (fn [[node cid]]
          {:scope        (name scope)
           :entity_type  (keyword (name scope))
           :entity_id    (long node)
           :community_id (long cid)
           :centrality   (double (get centrality node 0.0))
           :computed_at  now})
        partition)))
