(ns metabase-enterprise.data-complexity-score.complexity-embedders
  "Pluggable embedding sources for the complexity score's synonym axis.

  An embedder takes entities `{:id :name :kind}` and returns
  `{normalized-name -> ^floats vector}`, omitting entities without a known vector."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn normalize-name
  "Canonical form used for name-based lookups and comparisons. nil-safe."
  [s]
  (some-> s str/trim u/lower-case-en))

(defn split-for-embedding
  "Rewrite a raw name into space-separated natural-language tokens before embedding.

  `_`, `-`, `.`, and camelCase boundaries become spaces; adjacent whitespace is collapsed and
  the result is lowercased.
  Splitting happens *before* lowercasing so the camelCase boundary stays visible.

  Embedding models are trained on English: `\"monthly_active_users\"` is an out-of-distribution
  token while `\"monthly active users\"` hits three well-understood ones.

  See https://linear.app/metabase/document/synonym-analysis-21-april-2026-31c8ce76eddb for
  calibration data."
  [^String s]
  (when s
    (-> s
        (str/replace #"([a-z])([A-Z])" "$1 $2")
        (str/replace #"[_\-.]" " ")
        (str/replace #"\s+" " ")
        str/trim
        u/lower-case-en)))

(defn fn-embedder
  "Build an embedder that delegates to `(name-embed-fn names) -> [vectors]`.

  Distinct normalized names are passed in; returned vectors are zipped back by position.
  Names whose `name-embed-fn` returns nil are omitted from the result map."
  [name-embed-fn]
  (fn embed [entities]
    (let [names   (->> entities (keep (comp normalize-name :name)) distinct vec)
          vectors (when (seq names) (vec (name-embed-fn names)))]
      (into {} (filter val) (zipmap names vectors)))))

(def default-synonym-model
  "Fixed model descriptor for the complexity score's synonym axis.

  all-MiniLM-L6-v2 is a Sentence-Transformers model trained on Semantic Textual Similarity.
  STS precision beats retrieval recall for the \"are these two names confusingly similar\"
  question this axis asks.
  Arctic-L at 0.90 was the pragmatic fallback when only a retrieval model was available.

  Served through ai-service.
  When the model isn't deployed there yet, calls throw and the synonym axis reports nil
  measurements + an error — by design, so broken runs are visible rather than masquerading
  as zero.

  See https://linear.app/metabase/document/synonym-analysis-21-april-2026-31c8ce76eddb."
  {:provider         "ai-service"
   :model-name       "sentence-transformers/all-MiniLM-L6-v2"
   :model-dimensions 384})

(defn provider-embedder
  "Build an embedder that embeds names via `semantic-search/get-embeddings-batch` using
  `model-descriptor` (`{:provider :model-name :model-dimensions}`).

  For each distinct normalized name the raw form is sent through [[split-for-embedding]].
  Splitting *before* lowercasing preserves the camelCase boundary (`\"pageViews\"` →
  `\"page views\"`); the normalized key is what scoring looks up.

  Errors from the provider bubble up — `score-synonym-pairs` converts them into `nil`
  measurements + an `:error` field so a broken run is visible downstream."
  [model-descriptor]
  (fn embed [entities]
    (let [name->raw (reduce (fn [acc {nm :name}]
                              (if-let [n (normalize-name nm)]
                                (if (contains? acc n) acc (assoc acc n nm))
                                acc))
                            (array-map)
                            entities)
          names     (vec (keys name->raw))]
      (when (seq names)
        (let [texts   (mapv #(split-for-embedding (get name->raw %)) names)
              vectors (vec (semantic-search/get-embeddings-batch model-descriptor texts))]
          (into {}
                (keep (fn [[n v]] (when v [n (float-array v)])))
                (map vector names vectors)))))))

(def default-synonym-embedder
  "Default embedder for the complexity score's synonym axis.

  Held as a value (not a `defn`) so callers can identify the default path by identity — see
  `metabase-enterprise.data-complexity-score.complexity/complexity-scores`."
  (provider-embedder default-synonym-model))
