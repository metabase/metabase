(ns metabase-enterprise.data-complexity-score.complexity-embedders
  "Pluggable embedding sources for the complexity score's synonym axis.

  An embedder takes entities `{:id :name :kind}` and returns
  `{normalized-name -> ^floats vector}`, omitting entities without a known vector."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.embeddings.client :as embeddings]
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

(def default-text-variant
  "Which text form of each entity name gets embedded by the default synonym embedder.

  `:names-split` rewrites snake/kebab/dotted/camelCase names into space-separated English
  tokens before sending them to the provider — see [[split-for-embedding]].

  Alternatives worth considering (not implemented): `:names` (raw lowercased name),
  `:search-text` (type + name + description + schema, as the semantic-search indexer does),
  or `:typed-split` ([source|value] prefix + split name).
  The 2026-04-21 analysis shows names-split as the best default for both Arctic and MiniLM.

  The value rides the fingerprint so a future swap to another variant forces a re-score
  without a `formula-version` bump."
  :names-split)

(def ^:private ^Class floats-class
  "`float[]` class object — cached so [[ensure-floats]] can `instance?`-check without
  re-resolving on every vector."
  (class (float-array 0)))

(defn- ensure-floats
  "Return `v` as a `float[]`, copying only when it isn't already one.

  ai-service / openai providers already return primitive `float[]` (see `decode-embeddings`
  in `metabase-enterprise.semantic-search.embedding`), so the common path skips the copy."
  ^floats [v]
  (if (instance? floats-class v) v (float-array v)))

(def ^:private provider-batch-size
  "Names per `get-embeddings-batch` HTTP call.

  ai-service's `get-embeddings-batch` does no batching of its own, so without chunking here a
  large catalog would land as a single multi-MB request/response. 256 keeps each call bounded
  while staying well under any provider's per-request limit."
  256)

(defn provider-embedder
  "Build an embedder that embeds names via [[embeddings.client/get-embeddings-batch]] using
  `model-descriptor` (`{:provider :model-name :model-dimensions}`).

  For each distinct normalized name the raw form is sent through [[split-for-embedding]].
  Splitting *before* lowercasing preserves the camelCase boundary (`\"pageViews\"` →
  `\"page views\"`); the normalized key is what scoring looks up.

  Texts are chunked into `provider-batch-size` pieces so a large catalog doesn't land as a
  single oversized HTTP request — `get-embeddings-batch` does no chunking of its own for the
  ai-service / openai providers.

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
              vectors (into []
                            (mapcat #(embeddings/get-embeddings-batch model-descriptor %))
                            (partition-all provider-batch-size texts))]
          (into {}
                (keep (fn [[n v]] (when v [n (ensure-floats v)])))
                (map vector names vectors)))))))
