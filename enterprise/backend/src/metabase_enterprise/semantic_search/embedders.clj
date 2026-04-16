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

(def ^:private fetch-batch-size
  "Maximum number of `(model, model_id)` pairs per SQL query when reading from the pgvector index.
  Keeps the generated OR predicate bounded so we don't hit JDBC bind-parameter limits or produce
  query plans that choke on large installs."
  500)

(defn- normalize-name [s]
  (some-> s str/trim u/lower-case-en))

(defn- prefer-new-row?
  "Return true when `new-row` should replace `prior` as the representative for a normalized name.
  The only requirement is **determinism** — every run with the same data must pick the same winner,
  regardless of DB row order or batch boundaries. The actual winner (lowest-id vs highest-id) is
  unimportant because duplicate-name entities contribute the same similarity signal either way.
  Priority chain: numeric `:mid` (parsed `model_id`) — numeric beats nil, two numerics compare
  naturally — then the raw `model_id` string (so `\"2\"` vs `\"02\"` sorts deterministically even
  though they parse to the same number) — then `:model` as final tie-break."
  [{new-mid :mid new-model :model new-mid-str :model_id}
   {prior-mid :mid prior-model :model prior-mid-str :model_id}]
  (let [num-cmp (cond
                  (and new-mid prior-mid) (compare (long new-mid) (long prior-mid))
                  new-mid                 -1   ; numeric beats non-numeric
                  prior-mid                1
                  :else                   0)
        cmp     (if-not (zero? num-cmp)
                  num-cmp
                  (let [str-cmp (compare (str new-mid-str) (str prior-mid-str))]
                    (if-not (zero? str-cmp)
                      str-cmp
                      (compare new-model prior-model))))]
    (neg? cmp)))

(defn- parse-pgvector
  "Parse a pgvector string (\"[0.1, 0.2, ...]\") or similar into a float-array."
  [v]
  (cond
    (nil? v) nil
    (instance? (Class/forName "[F") v) v
    :else
    (let [s    (if (string? v) v (str v))
          nums (->> (-> s
                        (str/replace "[" "")
                        (str/replace "]" "")
                        (str/split #","))
                    (keep #(let [t (str/trim %)] (when (seq t) (Float/parseFloat t)))))]
      (float-array nums))))

(defn- fetch-batch
  "Query the active pgvector index table for a single batch of `(model, model_id)` pairs. Returns a
  seq of `{:model :model_id :name :embedding}` rows."
  [pgvector table-name pairs]
  (let [where   (into [:or]
                      (for [[m mid] pairs]
                        [:and [:= :model m] [:= :model_id mid]]))
        sql-vec (sql/format {:select   [:model :model_id :name :embedding]
                             :from     [(keyword table-name)]
                             :where    where}
                            {:quoted true})]
    (jdbc/execute! pgvector sql-vec {:builder-fn jdbc.rs/as-unqualified-lower-maps})))

(defn- fetch-by-model+id
  "Query the active pgvector index for `(model, model_id)` pairs, batching to stay under JDBC
  limits. Returns a seq of row maps."
  [pgvector table-name pairs]
  (when (seq pairs)
    (into [] (mapcat #(fetch-batch pgvector table-name %)) (partition-all fetch-batch-size pairs))))

(defn- try-active-index-state
  "Return the active index state, or nil if unavailable. Never throws."
  []
  (try
    (let [pgvector (semantic.env/get-pgvector-datasource!)
          md       (semantic.env/get-index-metadata)]
      (when-let [state (semantic.index-metadata/get-active-index-state pgvector md)]
        {:pgvector   pgvector
         :table-name (-> state :index :table-name)
         :model      (-> state :index :embedding-model)}))
    (catch Throwable t
      (log/debug t "Semantic-search index not available; search-index embedder will return {}")
      nil)))

(defn search-index-embedder
  "Embedder that reads vectors from the active semantic-search pgvector index. Returns `{}` when
  the index isn't available (premium feature off, not yet initialized, datasource unreachable).
  Never throws.

  When multiple entities share a normalized name but have different indexed embeddings, the row
  with the lowest numeric `model_id` wins (see `prefer-new-row?`) so the result is deterministic
  across runs regardless of batch boundaries."
  [entities]
  (if-let [{:keys [pgvector table-name]} (try-active-index-state)]
    (try
      (let [pairs (for [{:keys [id kind]} entities
                        :let [m (metabot/entity-type->search-model kind)]
                        :when m]
                    [m (str id)])
            rows  (fetch-by-model+id pgvector table-name pairs)
            ;; Global dedup: when multiple rows share a normalized name, pick the winner
            ;; using `prefer-new-row?` (lowest numeric model_id, then model as tie-break).
            ;; This must happen after all batches are merged so the choice is globally
            ;; correct, not just correct within each 500-row partition.
            keyed (reduce (fn [acc {:keys [name model_id] :as row}]
                            (let [k     (normalize-name name)
                                  row+  (assoc row :mid (parse-long model_id))
                                  prior (get acc k)]
                              (if (or (nil? prior) (prefer-new-row? row+ prior))
                                (assoc acc k row+)
                                acc)))
                          {}
                          rows)]
        (into {}
              (keep (fn [[k {:keys [embedding]}]]
                      (when-let [v (parse-pgvector embedding)]
                        [k v])))
              keyed))
      (catch Throwable t
        (log/warn t "search-index-embedder: failed to read from search index; returning {}")
        {}))
    {}))

(defn active-embedding-model
  "Return the embedding model metadata for the *active* search index, not the current configuration.
  Returns nil when the index is unreachable, not yet initialized, or the feature is disabled. Use
  this instead of `get-configured-embedding-model` when you need to know what model the index is
  *actually* serving — not just what the settings say."
  []
  (when-let [{:keys [model]} (try-active-index-state)]
    (when model
      {:provider   (:provider model)
       :model-name (:model-name model)})))
