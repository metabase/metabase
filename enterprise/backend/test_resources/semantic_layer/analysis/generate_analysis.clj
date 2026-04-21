(ns semantic-layer.analysis.generate-analysis
  "Master script: regenerate ALL analysis output files from the embedding variants.

  Produces sample_pairs and cluster analysis (v2) for every (model × text-type × catalog ×
  threshold) combination, writing to the structured output directory.

  Run via nREPL:
    (load-file \"enterprise/backend/test_resources/semantic_layer/analysis/generate_analysis.clj\")
    (semantic-layer.analysis.generate-analysis/generate-all!
      {:dump-dir \"enterprise/backend/test_resources/semantic_layer/appdb_dump\"})"
  (:require
   [semantic-layer.analysis.cluster-analysis-v2 :as clusters]
   [semantic-layer.analysis.sample-pairs :as sample-pairs]))

(def ^:private configs
  "All analysis runs to produce. Each entry defines the output subdirectory structure and parameters."
  [;; Arctic-L: names
   {:model "arctic-l" :text "names" :emb-file "names_arctic-l_1024d.json"
    :thresholds [0.80 0.85 0.90 0.95]}

   ;; Arctic-L: names-split
   {:model "arctic-l" :text "names-split" :emb-file "names_split_arctic-l_1024d.json"
    :thresholds [0.80 0.85 0.90 0.95]}

   ;; Arctic-L: search-text
   {:model "arctic-l" :text "search-text" :emb-file "search-text_arctic-l_1024d.json"
    :thresholds [0.80 0.85 0.90 0.95]}

   ;; Arctic-L: typed-split
   {:model "arctic-l" :text "typed-split" :emb-file "typed_split_arctic-l_1024d.json"
    :thresholds [0.80 0.85 0.90 0.95]}

   ;; MiniLM: names-split (lower threshold range)
   {:model "minilm" :text "names-split" :emb-file "names_split_minilm-l6v2_384d.json"
    :thresholds [0.20 0.30 0.40 0.50 0.60 0.70]}

   ;; MiniLM: typed-split (lower threshold range)
   {:model "minilm" :text "typed-split" :emb-file "typed_split_minilm-l6v2_384d.json"
    :thresholds [0.20 0.30 0.40 0.50 0.60 0.70]}])

(defn generate-all!
  [{:keys [dump-dir]}]
  (let [out-base (str dump-dir "/../analysis/output/")]
    (doseq [{:keys [model text emb-file thresholds]} configs
            catalog [:library :universe]]
      (let [dir (str out-base model "/" text "/" (name catalog) "/")]
        (.mkdirs (java.io.File. dir))

        ;; Sample pairs (one per model×text×catalog)
        (println (format "\n=== sample_pairs: %s/%s/%s ===" model text (name catalog)))
        (sample-pairs/run!
         {:dump-dir   dump-dir
          :embeddings emb-file
          :catalog    catalog
          :per-band   100
          :output     (str dir "sample_pairs.edn")})

        ;; Clusters at each threshold
        (doseq [threshold thresholds]
          (let [tag (format "%03d" (int (* threshold 100)))]
            (println (format "\n=== clusters: %s/%s/%s @ %s ===" model text (name catalog) tag))
            (clusters/run!
             {:dump-dir   dump-dir
              :embeddings emb-file
              :catalog    catalog
              :threshold  threshold
              :top-n      15
              ;; HAC only for library at moderate thresholds (small enough + informative)
              :hac?       (and (= catalog :library) (<= (count thresholds) 6))
              :output     (str dir "clusters_v2_" tag ".edn")})))))))
