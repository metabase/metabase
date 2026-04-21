(ns semantic-layer.analysis.sample-pairs
  "Script 1: For each threshold band, sample ~100 synonym pairs so you can eyeball what each
  similarity level actually looks like.

  Bands: [0.50-0.60) [0.60-0.70) [0.70-0.75) [0.75-0.80) [0.80-0.85) [0.85-0.90) [0.90-0.95) [0.95-1.0]

  Run via nREPL:
    (load-file \"enterprise/backend/test_resources/semantic_layer/analysis/sample_pairs.clj\")
    (semantic-layer.analysis.sample-pairs/run!
      {:dump-dir   \"enterprise/backend/test_resources/semantic_layer/appdb_dump\"
       :embeddings \"names_arctic-l_1024d.json\"   ; or \"search-text_arctic-l_1024d.json\"
       :catalog    :library                        ; or :universe
       :output     \"enterprise/backend/test_resources/semantic_layer/analysis/sample_pairs_library_names_L.edn\"})"
  (:require
   [clojure.pprint :as pprint]
   [metabase-enterprise.semantic-layer.complexity-embedders :as embedders]
   [metabase-enterprise.semantic-layer.representation :as rep]
   [metabase.util.json :as json]))

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

(def ^:private bands
  [[0.50 0.60] [0.60 0.70] [0.70 0.75] [0.75 0.80]
   [0.80 0.85] [0.85 0.90] [0.90 0.95] [0.95 1.01]])

(defn- sample-pairs-by-band
  "Walk the upper triangle of `names` × `vecs`, bucket each pair by similarity band,
  keep at most `per-band` samples per band. Stops collecting a band once it's full."
  [names vecs per-band]
  (let [n       (count names)
        buckets (atom (zipmap (map first bands) (repeat [])))
        full?   (fn [lo] (>= (count (get @buckets lo)) per-band))
        all-full? (fn [] (every? full? (map first bands)))]
    (loop [i 0]
      (when (and (< i n) (not (all-full?)))
        (let [a (vecs i)]
          (loop [j (inc i)]
            (when (and (< j n) (not (all-full?)))
              (let [sim (cosine-similarity a (vecs j))]
                (doseq [[lo hi] bands]
                  (when (and (>= sim lo) (< sim hi) (not (full? lo)))
                    (swap! buckets update lo conj
                           {:a (names i) :b (names j) :similarity (Math/round (* sim 10000.0))}))))
              (recur (inc j)))))
        (recur (inc i))))
    ;; Return sorted by band
    (into (sorted-map)
          (map (fn [[lo pairs]]
                 [(format "%.2f-%.2f" lo (second (first (filter #(= (first %) lo) bands))))
                  {:count (count pairs)
                   :pairs (vec (sort-by :similarity > pairs))}]))
          @buckets)))

(defn run!
  "Run the analysis. Options:
    :dump-dir   — path to the appdb_dump directory
    :embeddings — filename within dump-dir/embeddings/ (e.g., \"names_arctic-l_1024d.json\")
    :catalog    — :library or :universe
    :output     — path to write EDN results (optional, also prints summary)
    :per-band   — max pairs per band (default 100)"
  [{:keys [dump-dir embeddings catalog output per-band]
    :or   {per-band 100 catalog :library}}]
  (let [emb-path (str dump-dir "/embeddings/" embeddings)
        _        (println "Loading" emb-path "...")
        emb-map  (json/decode (slurp emb-path) false)
        {:keys [library universe]} (rep/load-dir dump-dir :embeddings-path nil)
        entities (case catalog :library library :universe universe)
        names    (->> entities (keep (comp embedders/normalize-name :name)) distinct vec)
        vecs     (vec (keep #(when-let [v (get emb-map %)] (float-array v)) names))
        ;; Filter names to those with vectors
        names    (vec (keep #(when (get emb-map %) %) names))
        _        (println (count names) "names with embeddings, sampling pairs...")
        result   (sample-pairs-by-band names vecs per-band)]
    ;; Print summary
    (doseq [[band {:keys [count]}] result]
      (println (format "  %s: %d pairs" band count)))
    ;; Write full output
    (when output
      (spit output (with-out-str (pprint/pprint result)))
      (println "Written to" output))
    result))
