(ns semantic-layer.analysis.cluster-analysis-v2
  "Enhanced cluster analysis with multiple clustering strategies and connectivity metrics.

  Three clustering methods, applied at the same threshold:

  1. **Connected components** (transitive): A and B are in the same cluster if there's ANY chain of
     pairwise similarities above threshold connecting them. Fast (union-find) but produces
     mega-clusters from weak transitive chains. Same as v1.

  2. **Complete-linkage** (fully-mutually-connected): every pair within a cluster must be above
     threshold. The strictest grouping — these are entities that are ALL pairwise confusable.
     Computed by building the adjacency graph and finding maximal cliques greedily.

  3. **Average-linkage HAC**: agglomerative clustering where two clusters merge only if their average
     pairwise similarity exceeds threshold. Balances strictness and coverage.
     Only feasible on library-sized catalogs (~250 names); skipped for universe.

  Each cluster carries connectivity metrics:
    - `:density`  — fraction of possible edges that are above threshold (1.0 = clique)
    - `:avg-sim`  — mean pairwise cosine similarity
    - `:min-sim`  — weakest pair (the \"weakest link\")

  Run via nREPL:
    (load-file \"enterprise/backend/test_resources/semantic_layer/analysis/cluster_analysis_v2.clj\")
    (semantic-layer.analysis.cluster-analysis-v2/run!
      {:dump-dir   \"enterprise/backend/test_resources/semantic_layer/appdb_dump\"
       :embeddings \"names_split_arctic-l_1024d.json\"
       :catalog    :library
       :threshold  0.90
       :top-n      15
       :output     \"...\"})"
  (:require
   [clojure.pprint :as pprint]
   [clojure.set :as set]
   [metabase-enterprise.semantic-layer.complexity-embedders :as embedders]
   [metabase-enterprise.semantic-layer.representation :as rep]
   [metabase.util.json :as json]))

;;; -------------------------------- math --------------------------------

(defn- dot ^double [^floats a ^floats b]
  (let [len (alength a)]
    (loop [i 0 acc 0.0]
      (if (< i len) (recur (inc i) (+ acc (* (aget a i) (aget b i)))) acc))))

(defn- cosine-sim ^double [^floats a ^floats b]
  (let [d (dot a b) na (Math/sqrt (dot a a)) nb (Math/sqrt (dot b b)) dn (* na nb)]
    (if (zero? dn) 0.0 (/ d dn))))

(defn- above-threshold? [^floats a ^floats b ^double norms-product ^double thresh-sq]
  (let [d (dot a b)]
    (and (pos? norms-product)
         (>= d 0.0)
         (>= (* d d) (* thresh-sq norms-product)))))

;;; ----------------------------- adjacency ------------------------------

(defn- build-adj
  "Build adjacency list: adj[i] = set of j where similarity(i,j) >= threshold."
  [vecs threshold]
  (let [n (count vecs)
        ^doubles norms (double-array n)
        _ (dotimes [i n] (aset norms i (dot (vecs i) (vecs i))))
        thresh-sq (* threshold threshold)
        adj (object-array n)]
    (dotimes [i n] (aset adj i (transient #{})))
    (dotimes [i n]
      (loop [j (inc i)]
        (when (< j n)
          (when (above-threshold? (vecs i) (vecs j) (* (aget norms i) (aget norms j)) thresh-sq)
            (let [^clojure.lang.ITransientCollection ai (aget adj i)
                  ^clojure.lang.ITransientCollection aj (aget adj j)]
              (aset adj i (conj! ai j))
              (aset adj j (conj! aj i))))
          (recur (inc j)))))
    (let [result (object-array n)]
      (dotimes [i n] (aset result i (persistent! (aget adj i))))
      result)))

;;; -------------------- clustering: connected components -----------------

(defn- connected-components [^objects adj n]
  (let [visited (boolean-array n)
        components (atom [])]
    (dotimes [start n]
      (when-not (aget visited start)
        (let [component (atom [])
              queue (java.util.ArrayDeque.)]
          (.add queue (int start))
          (aset visited start true)
          (while (not (.isEmpty queue))
            (let [v (.poll queue)]
              (swap! component conj v)
              (doseq [nb (aget adj v)]
                (when-not (aget visited nb)
                  (aset visited nb true)
                  (.add queue (int nb))))))
          (swap! components conj @component))))
    @components))

;;; ------------- clustering: complete-linkage (greedy cliques) -----------

(defn- greedy-cliques
  "Find cliques greedily: for each unassigned node, grow a clique by adding neighbors that are
  connected to ALL current clique members. Not optimal but fast and gives a useful lower bound."
  [^objects adj n]
  (let [assigned (boolean-array n)
        cliques  (atom [])]
    ;; Process nodes by degree descending (high-degree nodes seed bigger cliques)
    (doseq [start (sort-by #(- (count (aget adj %))) (range n))]
      (when-not (aget assigned start)
        (let [clique (atom #{start})
              candidates (atom (aget adj start))]
          ;; Greedily add candidates connected to ALL current members
          (doseq [c (sort-by #(- (count (aget adj %))) @candidates)]
            (when (every? #(contains? (aget adj c) %) @clique)
              (swap! clique conj c)
              (swap! candidates #(set/intersection % (aget adj c)))))
          ;; Mark all clique members as assigned
          (doseq [m @clique] (aset assigned m true))
          (swap! cliques conj (vec @clique)))))
    @cliques))

;;; ------------- clustering: average-linkage HAC -------------------------

(defn- avg-linkage-hac
  "Bottom-up HAC with average linkage. Merges clusters while the best merge exceeds `threshold`.
  O(n³) — only practical for n < ~500."
  [vecs threshold]
  (let [n (count vecs)
        ;; Precompute full similarity matrix
        sim (fn [i j] (cosine-sim (vecs i) (vecs j)))
        ;; Start: each item is its own cluster
        clusters (atom (into {} (map (fn [i] [i #{i}]) (range n))))
        ;; Precompute cluster-pair average sims lazily via a cache
        avg-sim  (fn [c1 c2]
                   (let [pairs (for [a c1 b c2] (sim a b))]
                     (/ (reduce + 0.0 pairs) (count pairs))))]
    (loop []
      (let [ids (keys @clusters)]
        (when (> (count ids) 1)
          ;; Find best merge
          (let [best (atom {:sim -1.0 :a nil :b nil})]
            (doseq [i (range (count ids))
                    j (range (inc i) (count ids))
                    :let [a (nth ids i) b (nth ids j)
                          s (avg-sim (get @clusters a) (get @clusters b))]]
              (when (> s (:sim @best))
                (reset! best {:sim s :a a :b b})))
            (when (>= (:sim @best) threshold)
              ;; Merge
              (let [{:keys [a b]} @best]
                (swap! clusters (fn [m]
                                  (-> m
                                      (assoc a (set/union (get m a) (get m b)))
                                      (dissoc b)))))
              (recur))))))
    (->> (vals @clusters)
         (map vec)
         (sort-by count >)
         vec)))

;;; ----------------------- cluster metrics ------------------------------

(defn- cluster-metrics
  "Compute density, avg-sim, min-sim for a cluster given its member indices and the adjacency list."
  [member-idxs ^objects adj vecs]
  (let [members (set member-idxs)
        n       (count members)
        max-edges (/ (* n (dec n)) 2)]
    (if (< n 2)
      {:size n :density 1.0 :avg-sim 1.0 :min-sim 1.0}
      (let [edges (atom 0)
            sim-sum (atom 0.0)
            sim-min (atom 1.0)
            member-vec (vec member-idxs)]
        (dotimes [ii n]
          (let [i (member-vec ii)]
            (loop [jj (inc ii)]
              (when (< jj n)
                (let [j (member-vec jj)
                      s (cosine-sim (vecs i) (vecs j))]
                  (when (contains? (aget adj i) j)
                    (swap! edges inc))
                  (swap! sim-sum + s)
                  (swap! sim-min min s))
                (recur (inc jj))))))
        {:size    n
         :density (double (/ @edges max-edges))
         :avg-sim (double (/ @sim-sum max-edges))
         :min-sim (double @sim-min)}))))

;;; --------------------------------- run ---------------------------------

(defn- format-cluster [names idxs ^objects adj vecs top-member-limit]
  (let [metrics  (if (<= (count idxs) 500)
                   (cluster-metrics idxs adj vecs)
                   {:size (count idxs) :density :skipped :avg-sim :skipped :min-sim :skipped})
        members  (mapv names idxs)]
    (cond-> {:members (if (<= (count members) top-member-limit)
                        members
                        (vec (concat (take top-member-limit members)
                                     [(str "... (" (count members) " total)")])))}
      true (merge metrics))))

(defn run!
  [{:keys [dump-dir embeddings catalog threshold top-n output hac?]
    :or   {threshold 0.90 top-n 15 catalog :library hac? :auto}}]
  (let [emb-path (str dump-dir "/embeddings/" embeddings)
        emb-map  (json/decode (slurp emb-path) false)
        {:keys [library universe]} (rep/load-dir dump-dir :embeddings-path nil)
        entities (case catalog :library library :universe universe)
        names    (->> entities (keep (comp embedders/normalize-name :name)) distinct vec)
        name->vec (fn [n] (when-let [v (get emb-map n)] (float-array v)))
        names    (vec (filter name->vec names))
        vecs     (mapv name->vec names)
        n        (count names)
        do-hac?  (if (= hac? :auto) (<= n 500) hac?)

        _   (println (format "%d names, threshold %.2f, catalog %s" n (double threshold) (name catalog)))
        _   (println "Building adjacency graph...")
        adj (build-adj vecs threshold)

        ;; Degree distribution
        degrees (mapv #(count (aget adj %)) (range n))
        sorted-deg (sort degrees)

        ;; 1. Connected components
        _   (println "Finding connected components...")
        cc  (connected-components adj n)
        cc-sorted (sort-by count > cc)

        ;; 2. Complete-linkage (greedy cliques)
        _   (println "Finding greedy cliques...")
        cliques (greedy-cliques adj n)
        cliques-sorted (sort-by count > cliques)

        ;; 3. Average-linkage HAC (library only)
        hac-clusters (when do-hac?
                       (println "Running average-linkage HAC (n=" n ")...")
                       (avg-linkage-hac vecs threshold))

        result
        {:threshold  threshold
         :catalog    catalog
         :embeddings embeddings
         :name-count n

         :degree-distribution
         {:min    (first sorted-deg)
          :p25    (nth sorted-deg (/ n 4))
          :median (nth sorted-deg (/ n 2))
          :p75    (nth sorted-deg (* 3 (/ n 4)))
          :max    (last sorted-deg)
          :mean   (double (/ (reduce + 0 degrees) n))}

         :connected-components
         {:count        (count cc)
          :multi-member (count (filter #(> (count %) 1) cc))
          :top          (mapv #(format-cluster names % adj vecs 30) (take top-n cc-sorted))}

         :greedy-cliques
         {:count        (count cliques)
          :multi-member (count (filter #(> (count %) 1) cliques))
          :top          (mapv #(format-cluster names % adj vecs 30) (take top-n cliques-sorted))}

         :avg-linkage-hac
         (when hac-clusters
           {:count        (count hac-clusters)
            :multi-member (count (filter #(> (count %) 1) hac-clusters))
            :top          (mapv (fn [idxs]
                                  (let [m (if (<= (count idxs) 30)
                                            (mapv names idxs)
                                            (vec (concat (take 30 (map names idxs))
                                                         [(str "... (" (count idxs) " total)")])))]
                                    {:size (count idxs) :members m}))
                                (take top-n hac-clusters))})}]

    ;; Print summary
    (println "\n--- Degree distribution (neighbors per name) ---")
    (let [d (:degree-distribution result)]
      (println (format "  min=%d  p25=%d  median=%d  p75=%d  max=%d  mean=%.1f"
                       (:min d) (:p25 d) (:median d) (:p75 d) (:max d) (:mean d))))

    (println "\n--- Connected components ---")
    (println (format "  %d total, %d multi-member"
                     (:count (:connected-components result))
                     (:multi-member (:connected-components result))))

    (println "\n--- Greedy cliques (fully-mutually-connected) ---")
    (println (format "  %d total, %d multi-member"
                     (:count (:greedy-cliques result))
                     (:multi-member (:greedy-cliques result))))

    (doseq [{:keys [size density avg-sim min-sim members]}
            (take 5 (:top (:greedy-cliques result)))]
      (println (format "  [%d] density=%.2f avg=%.3f min=%.3f %s"
                       size
                       (if (number? density) density 0.0)
                       (if (number? avg-sim) avg-sim 0.0)
                       (if (number? min-sim) min-sim 0.0)
                       (vec (take 5 members)))))

    (when hac-clusters
      (println "\n--- Average-linkage HAC ---")
      (println (format "  %d clusters, %d multi-member"
                       (count hac-clusters)
                       (count (filter #(> (count %) 1) hac-clusters))))
      (doseq [{:keys [size members]} (take 5 (:top (:avg-linkage-hac result)))]
        (println (format "  [%d] %s" size (vec (take 5 members))))))

    (when output
      (spit output (with-out-str (pprint/pprint result)))
      (println "\nWritten to" output))
    result))
