(ns metabase-enterprise.semantic-search.embedders
  "Embedders that expose the pgvector semantic-search index as a name → vector lookup for other
  features (initially the complexity score's synonym axis).

  An embedder takes a seq of entity maps `{:id :name :kind}` and returns a `{normalized-name →
  ^floats vector}` map, omitting entities the index doesn't know about. This lets callers fold
  reuse of the indexed embeddings into their own pipelines without having to know about the
  pgvector datasource, index metadata, or row shapes.

  The indexed text combines name + description + other search fields, so the similarity signal is
  closer to *\"semantically overlapping entities\"* than *\"synonymous names\"*. Good enough when
  the alternative is paying to embed every entity name from scratch."
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

(defn- normalize-name [s]
  (some-> s str/trim u/lower-case-en))

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
  "Return the active index state, or nil if unavailable. Never throws."
  []
  (try
    (let [pgvector (semantic.env/get-pgvector-datasource!)
          md       (semantic.env/get-index-metadata)]
      (when-let [state (semantic.index-metadata/get-active-index-state pgvector md)]
        {:pgvector   pgvector
         :table-name (-> state :index :table-name)}))
    (catch Throwable t
      (log/debug t "Semantic-search index not available; search-index embedder will return {}")
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
        (log/warn t "search-index-embedder: failed to read from search index; returning {}")
        {}))
    {}))
