(ns metabase-enterprise.data-complexity-score.complexity-embedders
  "Pluggable embedding sources for the complexity score's synonym axis.
  An embedder takes entities `{:id :name :kind}` and returns `{normalized-name -> ^floats vector}`,
  omitting entities without a known vector."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn normalize-name
  "Canonical form used for name-based lookups and comparisons. nil-safe."
  [s]
  (some-> s str/trim u/lower-case-en))

(defn split-for-embedding
  "Rewrite a raw name into space-separated natural-language tokens before embedding.
  `_`, `-`, `.`, and camelCase boundaries become spaces; adjacent whitespace is collapsed and the
  result is lowercased. Embedding models are trained on English, and `\"monthly_active_users\"`
  is an out-of-distribution token while `\"monthly active users\"` hits three well-understood
  ones — this preprocessing improves discrimination at every threshold. Splitting happens *before*
  lowercasing so the camelCase boundary is still visible. See
  `enterprise/backend/test_resources/semantic_layer/analysis/2026_04_21_data_analysis_summary.md`
  for the empirical effect."
  [^String s]
  (when s
    (-> s
        (str/replace #"([a-z])([A-Z])" "$1 $2")
        (str/replace #"[_\-.]" " ")
        (str/replace #"\s+" " ")
        str/trim
        u/lower-case-en)))

(defn fn-embedder
  "Build an embedder that delegates to a plain `(name-embed-fn names) -> [vectors]` function.
  Distinct normalized names are passed in; the returned vectors are zipped back by position.
  Names whose `name-embed-fn` returns nil are omitted from the result map."
  [name-embed-fn]
  (fn embed [entities]
    (let [names   (->> entities (keep (comp normalize-name :name)) distinct vec)
          vectors (when (seq names) (vec (name-embed-fn names)))]
      (into {} (filter val) (zipmap names vectors)))))

(defn file-embedder
  "Build an embedder from a pre-loaded `{name -> [float ...]}` map. Keys are run through
  [[normalize-name]] here so callers can hand in raw display names (`\"Revenue\"`, `\" Orders \"`)
  and still match what scoring looks up. Values may be seqs/vectors of floats or `^floats` arrays.
  Entities whose normalized name isn't in the map get no vector — same contract as the other embedders."
  [name->vec]
  (let [normalized (into {}
                         (keep (fn [[k v]]
                                 (when-let [n (normalize-name k)]
                                   [n (if (instance? (Class/forName "[F") v) v (float-array v))])))
                         name->vec)]
    (fn embed [_entities] normalized)))

(def default-synonym-model
  "Fixed model descriptor for the complexity score's synonym axis: all-MiniLM-L6-v2, a
  Sentence-Transformers model trained on Semantic Textual Similarity (STS). 384-dim, served via
  ollama. STS precision beats retrieval recall for the \"are these two names confusingly similar\"
  question this axis asks — Arctic-L at 0.90 was the pragmatic fallback when only a retrieval
  model was available. See the 2026-04-21 analysis summary."
  {:provider         "ollama"
   :model-name       "all-minilm:l6-v2"
   :model-dimensions 384})

(def default-text-variant
  "Which text form of each entity name gets embedded by the default synonym embedder. `:names-split`
  rewrites snake/kebab/dotted/camelCase names into space-separated English tokens before sending
  them to the provider — see [[split-for-embedding]]. Alternatives worth considering (not
  implemented) include `:names` (raw lowercased name), `:search-text` (type + name + description +
  schema, as the semantic-search indexer does), or `:typed-split` ([source|value] prefix + split
  name). The calibration data in the 2026-04-21 analysis summary shows names-split as the best
  default for both Arctic and MiniLM; the value rides the fingerprint so a future change to a
  different variant is visible without bumping `formula-version`."
  :names-split)

(defn provider-embedder
  "Build an embedder that embeds names via `semantic-search/get-embeddings-batch` using
  `model-descriptor` (`{:provider :model-name :model-dimensions}`). For each distinct normalized
  name we send its raw form through [[split-for-embedding]] — splitting *before* lowercasing
  preserves the camelCase boundary information (`\"pageViews\"` → `\"page views\"`) that the
  embedding model cares about, while the normalized key is what scoring looks up.

  Degrades quietly to `{}` on any failure (ollama unreachable, model not pulled, network error):
  the synonym axis scores 0 for that run, matching the existing search-index-embedder contract.
  A warning is logged so operators can distinguish silent zero from real zero."
  [model-descriptor]
  (fn embed [entities]
    (let [name->raw (reduce (fn [acc {nm :name}]
                              (if-let [n (normalize-name nm)]
                                (if (contains? acc n) acc (assoc acc n nm))
                                acc))
                            (array-map)
                            entities)
          names     (vec (keys name->raw))]
      (if (empty? names)
        {}
        (try
          (let [texts   (mapv #(split-for-embedding (get name->raw %)) names)
                vectors (vec (semantic-search/get-embeddings-batch model-descriptor texts))]
            (into {}
                  (keep (fn [[n v]] (when v [n (float-array v)])))
                  (map vector names vectors)))
          (catch Throwable t
            (log/warn t "Complexity score: provider embedder failed; falling back to 0")
            {}))))))

(def default-synonym-embedder
  "Default embedder for the complexity score's synonym axis. Held as a top-level value (not a
  `defn`) so callers can identify the default path by identity comparison — see
  `metabase-enterprise.data-complexity-score.complexity/complexity-scores`."
  (provider-embedder default-synonym-model))
