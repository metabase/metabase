(ns metabase-enterprise.data-complexity-score.complexity-embedders
  "Pluggable embedding sources for the complexity score's synonym axis.
  An embedder takes entities `{:id :name :kind}` and returns `{normalized-name -> ^floats vector}`,
  omitting entities without a known vector."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn normalize-name
  "Canonical form used for name-based lookups and comparisons. nil-safe."
  [s]
  (some-> s str/trim u/lower-case-en))

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

(defn provider-embedder
  "Route the synonym axis through the semantic-search embedding dispatcher for a specific
  `{:provider :model-name :vector-dimensions}` config, independent of the active search-index
  model. Goes via
  [[metabase-enterprise.semantic-search.embedding/process-embeddings-streaming]] so provider-level
  batching constraints (e.g. `openai-max-tokens-per-batch`) are honoured — calling
  `get-embeddings-batch` directly would send every distinct entity name in one request and blow
  past upstream limits on larger catalogs.

  Returns `nil` when the config is incomplete (missing provider or model-name). Runtime errors
  from the underlying dispatcher (invalid API key, network failure, rate limits, etc.) propagate
  so `score-synonym-pairs` surfaces them as `:error` on the synonym-pairs result instead of the
  embedder silently returning an empty map. Config-level prerequisites (API key set, base URL set)
  should be validated by the caller before instantiating this embedder so a known-misconfigured
  provider never reaches the dispatcher — see
  [[metabase-enterprise.semantic-search.core/provider-ready?]]."
  [{:keys [provider model-name] :as embedding-model}]
  (when (and (seq provider) (seq model-name))
    (fn-embedder
     (fn [names]
       ;; Default to {} so an empty result from process-embeddings-streaming (e.g. every input
       ;; dropped by create-batches for exceeding openai-max-tokens-per-batch) degrades via the
       ;; "no vector → no synonym signal" path in fn-embedder instead of throwing on nil lookup.
       ;; mapv forces realization here so any dispatcher errors surface from this embedder call
       ;; rather than being deferred until fn-embedder walks the lazy seq.
       (let [text->vec (or (semantic-search/process-embeddings-streaming
                            embedding-model names identity)
                           {})]
         (mapv text->vec names))))))
