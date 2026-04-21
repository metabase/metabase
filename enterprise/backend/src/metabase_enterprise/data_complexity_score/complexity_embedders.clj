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
  Returns `nil` when the config is incomplete (missing provider or model-name). Any thrown error
  from the underlying dispatcher is caught and converted into a nil vector collection so the
  fn-embedder shape drops every name and the synonym axis degrades gracefully per the embedder
  contract."
  [{:keys [provider model-name] :as embedding-model}]
  (when (and (seq provider) (seq model-name))
    (fn-embedder
     (fn [names]
       (try
         (let [text->vec (semantic-search/process-embeddings-streaming
                          embedding-model names identity)]
           ;; Preserve input order so the zipmap in fn-embedder lines names up with their vectors.
           ;; Names dropped by create-batches (oversized texts) map to nil here and fn-embedder
           ;; filters them out — matching the "no vector → no synonym signal" contract.
           (map text->vec names))
         (catch Throwable t
           (log/warn t "provider-embedder: embedding streaming failed; disabling synonym axis")
           nil))))))
