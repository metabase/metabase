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
  "Canonical form used for name-based lookups, comparisons, *and* embedding input. nil-safe.

  `_`, `-`, `.`, and camelCase boundaries become spaces; adjacent whitespace is collapsed and
  the result is lowercased.

  Embedding models are trained on English: `\"monthly_active_users\"` is an out-of-distribution
  token while `\"monthly active users\"` hits three well-understood ones. We use the same
  transform for the dedup key so `\"monthlyActiveUsers\"` and `\"monthly_active_users\"` collapse
  to one entry — without it, equivalent names would each be embedded separately and then show
  up as a 1.0-cosine synonym pair instead of a name collision.

  See https://linear.app/metabase/document/synonym-analysis-21-april-2026-31c8ce76eddb for
  calibration data."
  [s]
  (when s
    (-> ^String s
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

(def ^:private ^Class floats-class
  "`float[]` class object — cached so callers can `instance?`-check without re-resolving on every
  vector."
  (class (float-array 0)))

(defn- ensure-floats
  "Return `v` as a `float[]`, copying only when it isn't already one.

  ai-service / openai providers already return primitive `float[]` (see `decode-embeddings`
  in `metabase-enterprise.semantic-search.embedding`), so the common path skips the copy."
  ^floats [v]
  (if (instance? floats-class v) v (float-array v)))

(defn file-embedder
  "Build an embedder from a pre-loaded `{name -> [float ...]}` map.
  Keys are run through [[normalize-name]] here so callers can hand in raw display names.
  Values may be seqs/vectors of floats or `^floats` arrays.
  Entities whose normalized name isn't in the map get no vector — same contract as the other embedders."
  [name->vec]
  (let [normalized (into {}
                         (keep (fn [[k v]]
                                 (when-let [n (normalize-name k)]
                                   [n (ensure-floats v)])))
                         name->vec)]
    (fn embed [_entities] normalized)))

(def default-text-variant
  "Which text form of each entity name gets embedded by the default synonym embedder.

  `:names-split` rewrites snake/kebab/dotted/camelCase names into space-separated English
  tokens before sending them to the provider — see [[normalize-name]], which is now also the
  dedup key (so equivalent names embed once).

  Alternatives worth considering (not implemented):
  - `:names` (raw lowercased name without splitting)
  - `:search-text` (type + name + description + schema, as the semantic-search indexer does)
  - `:typed-split` ([source|value] prefix + split name).

  The 2026-04-21 analysis suggested names-split as the best default for both Arctic and MiniLM."
  :names-split)

(def ^:private provider-batch-size
  "Names per `get-embeddings-batch` HTTP call.

  ai-service's `get-embeddings-batch` does no batching of its own, so without chunking here a
  large catalog would land as a single multi-MB request/response. 256 keeps each call bounded
  while staying well under any provider's per-request limit."
  256)

(defn provider-embedder
  "Build an embedder that embeds names via [[embeddings.client/get-embeddings-batch]] using
  `model-descriptor` (`{:provider :model-name :model-dimensions}`).

  Distinct normalized names — already in split form thanks to [[normalize-name]] — are sent
  directly to the provider. Texts are chunked into `provider-batch-size` pieces so a large
  catalog doesn't land as a single oversized HTTP request; `get-embeddings-batch` does no
  chunking of its own for the ai-service / openai providers.

  Passes `:record-tokens? false` so complexity-score runs don't write to
  `semantic_search_token_tracking` — the score is its own analytics signal and the embedding
  calls here aren't user-driven search traffic. Holds for the CLI, the Quartz cron, and the
  API endpoint alike.

  Errors from the provider bubble up — `score-synonym-pairs` converts them into `nil`
  measurements + an `:error` field so a broken run is visible downstream."
  [model-descriptor]
  (fn embed [entities]
    (let [names (->> entities (keep (comp normalize-name :name)) distinct vec)]
      (when (seq names)
        (let [vectors (into []
                            (mapcat #(embeddings/get-embeddings-batch
                                      model-descriptor % :record-tokens? false))
                            (partition-all provider-batch-size names))]
          (into {}
                (keep (fn [[n v]] (when v [n (ensure-floats v)])))
                (map vector names vectors)))))))
