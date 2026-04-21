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
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.audit-app.core :as audit]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- split-name [s]
  (-> s
      (str/replace #"([a-z])([A-Z])" "$1 $2")
      (str/replace #"[_.\-]" " ")
      (str/replace #" +" " ")
      str/trim str/lower-case))

(defn- load-entities []
  (let [tables (t2/select [:model/Table :name :description :schema] :active true :db_id [:not= audit/audit-db-id])
        cards  (t2/select [:model/Card :name :description :type :card_schema]
                          :type [:in ["metric" "model"]]
                          :archived false :database_id [:not= audit/audit-db-id])]
    {:tables tables :cards cards}))

(defn- build-texts
  "Build `{normalized-name → text-to-embed}` for a given text-type."
  [text-type {:keys [tables cards]}]
  (let [entries
        (case text-type
          :names
          (concat (map (fn [t] [(embedders/normalize-name (:name t)) (:name t)]) tables)
                  (map (fn [c] [(embedders/normalize-name (:name c)) (:name c)]) cards))

          :names-split
          (concat (map (fn [t] [(embedders/normalize-name (:name t)) (split-name (:name t))]) tables)
                  (map (fn [c] [(embedders/normalize-name (:name c)) (split-name (:name c))]) cards))

          :search-text
          (concat
           (map (fn [t] [(embedders/normalize-name (:name t))
                         (str "[table] " (:name t)
                              (when (:description t) (str " - " (subs (:description t) 0 (min 100 (count (:description t))))))
                              (when (:schema t) (str " (" (:schema t) ")")))]) tables)
           (map (fn [c] [(embedders/normalize-name (:name c))
                         (str "[" (:type c) "] " (:name c)
                              (when (:description c) (str " - " (subs (:description c) 0 (min 100 (count (:description c)))))))]) cards))

          :typed-split
          (concat
           (map (fn [t] [(embedders/normalize-name (:name t)) (str "[source] " (split-name (:name t)))]) tables)
           (map (fn [c] [(embedders/normalize-name (:name c))
                         (str "[" (if (= (:type c) "metric") "value" "source") "] "
                              (split-name (:name c)))]) cards)))]
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
  "All (text-type × model) combinations to produce."
  [{:text-type :names       :model-name "snowflake-arctic-embed:l" :file "names_arctic-l_1024d.json"}
   {:text-type :names-split :model-name "snowflake-arctic-embed:l" :file "names_split_arctic-l_1024d.json"}
   {:text-type :search-text :model-name "snowflake-arctic-embed:l" :file "search-text_arctic-l_1024d.json"}
   {:text-type :typed-split :model-name "snowflake-arctic-embed:l" :file "typed_split_arctic-l_1024d.json"}
   {:text-type :names-split :model-name "all-minilm:l6-v2"        :file "names_split_minilm-l6v2_384d.json"}
   {:text-type :typed-split :model-name "all-minilm:l6-v2"        :file "typed_split_minilm-l6v2_384d.json"}])

(defn generate-all!
  "Generate all embedding variants. Requires ollama running with the relevant models pulled."
  [{:keys [dump-dir]}]
  (let [emb-dir  (str dump-dir "/embeddings/")
        entities (load-entities)]
    (.mkdirs (java.io.File. emb-dir))
    (doseq [{:keys [text-type model-name file]} variants]
      (println (format "\n=== %s × %s ===" (name text-type) model-name))
      (let [texts (build-texts text-type entities)
            model {:provider "ollama" :model-name model-name}]
        (embed-batch! model texts (str emb-dir file))))))
