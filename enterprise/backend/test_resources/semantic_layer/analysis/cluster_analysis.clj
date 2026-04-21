(ns semantic-layer.analysis.cluster-analysis
  "Script 2: At a chosen threshold, build a synonym graph, find connected components (clusters),
  and report:
    - Number of distinct clusters
    - Cluster size distribution (histogram + summary stats)
    - Top-N largest clusters with their member names
    - Min/mean/median/max pairwise similarity within the top-N clusters

  Run via nREPL:
    (load-file \"enterprise/backend/test_resources/semantic_layer/analysis/cluster_analysis.clj\")
    (semantic-layer.analysis.cluster-analysis/run!
      {:dump-dir   \"enterprise/backend/test_resources/semantic_layer/appdb_dump\"
       :embeddings \"names_arctic-l_1024d.json\"
       :catalog    :library       ; or :universe
       :threshold  0.80
       :top-n      10             ; detailed stats for the N largest clusters
       :output     \"enterprise/backend/test_resources/semantic_layer/analysis/clusters_library_names_L_080.edn\"})"
  (:require
   [clojure.pprint :as pprint]
   [metabase-enterprise.semantic-layer.complexity-embedders :as embedders]
   [metabase-enterprise.semantic-layer.representation :as rep]
   [metabase.util.json :as json]))

;;; -------------------------------- math --------------------------------

(defn- dot ^double [^floats a ^floats b]
  (let [len (alength a)]
    (loop [i 0 acc 0.0]
      (if (< i len) (recur (inc i) (+ acc (* (aget a i) (aget b i)))) acc))))

(defn- cosine-similarity ^double [^floats a ^floats b]
  (let [d (dot a b)
        na (Math/sqrt (dot a a))
        nb (Math/sqrt (dot b b))
        denom (* na nb)]
    (if (zero? denom) 0.0 (/ d denom))))

;;; ----------------------------- union-find -----------------------------

(defn- make-uf
  "Create a union-find structure for `n` elements."
  [n]
  {:parent (int-array (range n))
   :rank   (int-array n)})

(defn- uf-find
  "Find root with path compression."
  [{:keys [^ints parent]} ^long x]
  (loop [x x]
    (let [p (aget parent x)]
      (if (= p x)
        x
        (let [pp (aget parent p)]
          (aset parent x pp)
          (recur pp))))))

(defn- uf-union!
  "Union by rank."
  [{:keys [^ints parent ^ints rank] :as uf} ^long a ^long b]
  (let [ra (uf-find uf a)
        rb (uf-find uf b)]
    (when-not (= ra rb)
      (let [rka (aget rank ra)
            rkb (aget rank rb)]
        (cond
          (< rka rkb) (aset parent ra rb)
          (> rka rkb) (aset parent rb ra)
          :else       (do (aset parent rb ra)
                          (aset rank ra (inc rka))))))))

;;; ----------------------------- clustering -----------------------------

(defn- build-clusters
  "Walk the upper triangle, union pairs above `threshold`, return clusters as
  `[[name ...] ...]` sorted by size descending."
  [names vecs threshold]
  (let [n         (count names)
        uf        (make-uf n)
        thresh-sq (* threshold threshold)
        ^doubles norms (double-array n)]
    ;; Precompute norms
    (dotimes [i n]
      (aset norms i (dot (vecs i) (vecs i))))
    ;; Union similar pairs (squared comparison, no sqrt)
    (dotimes [i n]
      (loop [j (inc i)]
        (when (< j n)
          (let [d  (dot (vecs i) (vecs j))
                np (* (aget norms i) (aget norms j))]
            (when (and (pos? np) (>= d 0.0) (>= (* d d) (* thresh-sq np)))
              (uf-union! uf i j)))
          (recur (inc j)))))
    ;; Extract clusters
    (let [groups (group-by #(uf-find uf %) (range n))]
      (->> (vals groups)
           (map (fn [idxs] (mapv names idxs)))
           (sort-by count >)
           vec))))

(defn- cluster-pairwise-stats
  "Compute min/mean/median/max cosine similarity for all pairs within a cluster.
  Only call on reasonably-sized clusters (< ~1000 members)."
  [members name->vec]
  (let [vecs  (mapv name->vec members)
        n     (count vecs)
        sims  (java.util.ArrayList.)]
    (dotimes [i n]
      (loop [j (inc i)]
        (when (< j n)
          (.add sims (cosine-similarity (vecs i) (vecs j)))
          (recur (inc j)))))
    (let [arr  (double-array sims)
          _    (java.util.Arrays/sort arr)
          cnt  (alength arr)]
      (when (pos? cnt)
        {:pairs  cnt
         :min    (aget arr 0)
         :median (aget arr (quot cnt 2))
         :mean   (/ (reduce + 0.0 (seq arr)) cnt)
         :max    (aget arr (dec cnt))}))))

(defn- size-histogram
  "Summarise cluster sizes as a frequency map + basic stats."
  [clusters]
  (let [sizes     (mapv count clusters)
        freq      (frequencies sizes)
        n         (count sizes)
        total     (reduce + 0 sizes)
        sorted-sz (sort sizes)]
    {:cluster-count   n
     :singleton-count (get freq 1 0)
     :multi-count     (- n (get freq 1 0))
     :size-freq       (into (sorted-map) freq)
     :min-size        (first sorted-sz)
     :max-size        (last sorted-sz)
     :mean-size       (when (pos? n) (double (/ total n)))
     :median-size     (when (pos? n) (nth sorted-sz (quot n 2)))}))

;;; --------------------------------- run ---------------------------------

(defn run!
  [{:keys [dump-dir embeddings catalog threshold top-n output]
    :or   {threshold 0.80 top-n 10 catalog :library}}]
  (let [emb-path (str dump-dir "/embeddings/" embeddings)
        _        (println "Loading" emb-path "...")
        emb-map  (json/decode (slurp emb-path) false)
        {:keys [library universe]} (rep/load-dir dump-dir :embeddings-path nil)
        entities (case catalog :library library :universe universe)
        names    (->> entities (keep (comp embedders/normalize-name :name)) distinct vec)
        name->vec (fn [n] (when-let [v (get emb-map n)] (float-array v)))
        ;; Filter to names with embeddings
        names    (vec (filter name->vec names))
        vecs     (mapv name->vec names)
        _        (println (count names) "names," "threshold" threshold ", catalog" catalog)
        _        (println "Building clusters...")
        clusters (build-clusters names vecs threshold)
        hist     (size-histogram clusters)
        _        (println (:cluster-count hist) "clusters,"
                          (:multi-count hist) "with >1 member,"
                          "largest:" (:max-size hist))

        ;; Top-N detailed analysis (cap cluster size for pairwise stats at 1000)
        top      (take top-n clusters)
        top-detail
        (mapv (fn [members]
                (let [stats (when (<= (count members) 1000)
                              (cluster-pairwise-stats members name->vec))]
                  (cond-> {:size    (count members)
                           :members (if (<= (count members) 50)
                                      members
                                      (concat (take 25 members) ["..." (str "(" (count members) " total)")]))}
                    stats (assoc :pairwise-similarity stats))))
              top)

        result {:threshold threshold
                :catalog   catalog
                :embeddings embeddings
                :histogram hist
                :top-clusters top-detail}]

    ;; Print summary
    (println "\n--- Cluster size distribution ---")
    (doseq [[sz freq] (:size-freq hist)]
      (println (format "  size %4d: %d cluster(s)" sz freq)))
    (println "\n--- Top" (count top-detail) "clusters ---")
    (doseq [{:keys [size members pairwise-similarity]} top-detail]
      (println (format "\n  [%d members]" size))
      (when pairwise-similarity
        (println (format "    similarity — min: %.3f  mean: %.3f  median: %.3f  max: %.3f"
                         (:min pairwise-similarity)
                         (:mean pairwise-similarity)
                         (:median pairwise-similarity)
                         (:max pairwise-similarity))))
      (let [display (if (<= size 20) members (concat (take 10 members) ["..."]))]
        (println "    members:" (vec display))))

    ;; Write full output
    (when output
      (spit output (with-out-str (pprint/pprint result)))
      (println "\nWritten to" output))
    result))
