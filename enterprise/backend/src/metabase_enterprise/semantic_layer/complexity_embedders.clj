(ns metabase-enterprise.semantic-layer.complexity-embedders
  "Pluggable embedding sources for the complexity score's synonym axis.

  An embedder is a function:

    (embedder entities) -> {normalized-name -> ^floats vector}

  where `entities` are `{:id :name :kind}` maps and the returned map supplies a vector for each
  name that has one available. Entities without an embedding are simply absent — the caller
  treats them as having no synonym signal. A nil embedder, an empty-map result, or a thrown
  exception all disable the synonym axis gracefully.

  Two implementations are provided; wire in others as needed:

  - `search-index-embedder` reuses vectors already computed by the semantic search subsystem.
    Cheap in prod; only covers entities the indexer has seen; the indexed text combines name +
    description + other search fields, so the similarity signal is closer to *\"semantically
    overlapping entities\"* than *\"synonymous names\"*. Good enough for v1 at zero marginal cost.

  - `fn-embedder` adapts a plain `(names -> vectors)` function. Used by tests; also the natural
    hook for a future name-only cached embedder."
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase.metabot.core :as metabot]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(defn normalize-name
  "Canonical form used for name-based lookups and comparisons. nil-safe."
  [s]
  (some-> s str/trim u/lower-case-en))

;;; -------------------------------------- fn-embedder -------------------------------------

(defn fn-embedder
  "Build an embedder that delegates to a plain `(name-embed-fn names) -> [vectors]` function.
  Distinct normalized names are passed in; the returned vectors are zipped back by position."
  [name-embed-fn]
  (fn embed [entities]
    (let [names   (->> entities (keep (comp normalize-name :name)) distinct vec)
          vectors (when (seq names) (vec (name-embed-fn names)))]
      (zipmap names vectors))))

;;; -------------------------------- search-index-embedder --------------------------------

(defn- parse-pgvector
  "Parse a pgvector string (\"[0.1, 0.2, ...]\") or similar into a float-array."
  [v]
  (cond
    (nil? v) nil
    (instance? (Class/forName "[F") v) v
    :else
    (let [s (if (string? v) v (str v))
          nums (->> (-> s
                        (str/replace "[" "")
                        (str/replace "]" "")
                        (str/split #","))
                    (keep #(let [t (str/trim %)] (when (seq t) (Float/parseFloat t)))))]
      (float-array nums))))

(defn- fetch-by-model+id
  "Query the active pgvector index table for `(model, model_id)` pairs. Returns a seq of
  `{:model :model_id :name :embedding}` rows."
  [pgvector table-name pairs]
  (when (seq pairs)
    (let [where   (into [:or]
                        (for [[m mid] pairs]
                          [:and [:= :model m] [:= :model_id mid]]))
          sql-vec (sql/format {:select [:model :model_id :name :embedding]
                               :from   [(keyword table-name)]
                               :where  where}
                              {:quoted true})]
      (jdbc/execute! pgvector sql-vec
                     {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))

(defn- try-active-index-state
  "Return the active semantic-search index state, or nil if unavailable. Never throws."
  []
  (try
    (let [pgvector (semantic.env/get-pgvector-datasource!)
          md       (semantic.env/get-index-metadata)]
      (when-let [state (semantic.index-metadata/get-active-index-state pgvector md)]
        {:pgvector   pgvector
         :table-name (-> state :index :table-name)}))
    (catch Throwable t
      (log/debug t "Complexity score: semantic-search index not available; skipping search-index embeddings")
      nil)))

(defn search-index-embedder
  "Embedder that reads vectors from the active semantic-search pgvector index. Returns `{}` when
  the index isn't available (premium feature off, not yet initialized, datasource unreachable).
  Never throws."
  [entities]
  (if-let [{:keys [pgvector table-name]} (try-active-index-state)]
    (try
      (let [pairs (for [{:keys [id kind]} entities
                        :let [m (metabot/entity-type->search-model kind)]
                        :when m]
                    [m (str id)])
            rows  (fetch-by-model+id pgvector table-name pairs)]
        (into {}
              (keep (fn [{:keys [name embedding]}]
                      (when-let [v (parse-pgvector embedding)]
                        [(normalize-name name) v])))
              rows))
      (catch Throwable t
        (log/warn t "Complexity score: failed to read from search index; synonym axis degraded to 0")
        {}))
    {}))
