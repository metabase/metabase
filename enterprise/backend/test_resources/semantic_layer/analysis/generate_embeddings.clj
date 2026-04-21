(ns semantic-layer.analysis.generate-embeddings
  "Generate embedding files for the appdb dump. Run once when the dump or models change.

  Produces one JSON file per (text-type × model) combination in the embeddings/ subdirectory.

  Run via nREPL:
    (load-file \"enterprise/backend/test_resources/semantic_layer/analysis/generate_embeddings.clj\")
    (semantic-layer.analysis.generate-embeddings/generate-all!
      {:dump-dir \"enterprise/backend/test_resources/semantic_layer/appdb_dump\"})"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-layer.complexity-embedders :as embedders]
   [metabase-enterprise.semantic-layer.representation :as rep]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.util.json :as json]))

(defn- split-name [s]
  (-> s
      (str/replace #"([a-z])([A-Z])" "$1 $2")
      (str/replace #"[_.\-]" " ")
      (str/replace #" +" " ")
      str/trim str/lower-case))

(defn- load-entities
  "Union of library + universe entities from the JSON dump, deduped by `[kind id]`.

  Going through `representation/load-dir` ensures the generated embeddings cover every entity any
  downstream analysis can ask for: `:universe` drops audit-DB content, but `:library` intentionally
  keeps library-collection audit content, so filtering to universe-only here would silently drop
  library audit entities from the output."
  [dump-dir]
  (let [{:keys [library universe]} (rep/load-dir dump-dir)]
    (vec (vals (into {} (map (fn [e] [[(:kind e) (:id e)] e])) (concat library universe))))))

(defn- typed-prefix [kind]
  (if (= kind :metric) "[value]" "[source]"))

(defn- build-texts
  "Build `{normalized-name → text-to-embed}` for a given text-type.

  Entities come from `rep/load-dir`, which only carries `:name` and `:kind` (not `:description` or
  `:schema`), so the `:search-text` variant is intentionally not supported here — feed a richer
  export if you need it."
  [text-type entities]
  (let [entries
        (case text-type
          :names
          (map (fn [e] [(embedders/normalize-name (:name e)) (:name e)]) entities)

          :names-split
          (map (fn [e] [(embedders/normalize-name (:name e)) (split-name (:name e))]) entities)

          :typed-split
          (map (fn [e] [(embedders/normalize-name (:name e))
                        (str (typed-prefix (:kind e)) " " (split-name (:name e)))])
               entities))]
    ;; First-wins dedup by normalized name
    (reduce (fn [acc [n txt]] (if (contains? acc n) acc (assoc acc n txt))) {} entries)))

(defn- embed-batch! [model texts-by-name out-path]
  (let [names   (vec (keys texts-by-name))
        batches (partition-all 10 (map (fn [n] [n (texts-by-name n)]) names))
        embs    (atom {})
        t0      (System/currentTimeMillis)]
    (println (format "  %d names → %s" (count names) out-path))
    (doseq [[i batch] (map-indexed vector batches)]
      (let [vs (embedding/get-embeddings-batch model (mapv second batch))]
        (doseq [[n v] (map vector (mapv first batch) vs)]
          (swap! embs assoc n (vec v))))
      (when (zero? (mod (inc i) 100))
        (println (format "    %d/%d %.0fs" (inc i) (count batches)
                         (/ (- (System/currentTimeMillis) t0) 1000.0)))))
    (spit out-path (json/encode @embs))
    (println (format "    Done: %d embeddings in %.0fs" (count @embs)
                     (/ (- (System/currentTimeMillis) t0) 1000.0)))))

(def ^:private variants
  "All (text-type × model) combinations to produce.

  `:search-text` is intentionally absent: it would need `:description`/`:schema` per entity, which
  the JSON dump here does not carry. Regenerating from this dump would collapse `:search-text` to
  `[kind] name` and silently masquerade as valid output. Produce `:search-text` embeddings from a
  richer export if needed."
  [{:text-type :names       :model-name "snowflake-arctic-embed:l" :file "names_arctic-l_1024d.json"}
   {:text-type :names-split :model-name "snowflake-arctic-embed:l" :file "names_split_arctic-l_1024d.json"}
   {:text-type :typed-split :model-name "snowflake-arctic-embed:l" :file "typed_split_arctic-l_1024d.json"}
   {:text-type :names-split :model-name "all-minilm:l6-v2"        :file "names_split_minilm-l6v2_384d.json"}
   {:text-type :typed-split :model-name "all-minilm:l6-v2"        :file "typed_split_minilm-l6v2_384d.json"}])

(defn generate-all!
  "Generate all embedding variants. Requires ollama running with the relevant models pulled."
  [{:keys [dump-dir]}]
  (let [emb-dir  (str dump-dir "/embeddings/")
        entities (load-entities dump-dir)]
    (.mkdirs (java.io.File. emb-dir))
    (doseq [{:keys [text-type model-name file]} variants]
      (println (format "\n=== %s × %s ===" (name text-type) model-name))
      (let [texts (build-texts text-type entities)
            model {:provider "ollama" :model-name model-name}]
        (embed-batch! model texts (str emb-dir file))))))
