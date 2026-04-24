(ns metabase-enterprise.semantic-search.embedders
  "Embedders that expose the pgvector semantic-search index as a name → vector lookup.
  An embedder takes entity maps `{:id :name :kind}` and returns `{normalized-name → ^floats vector}`,
  omitting entities not in the index."
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
  Keeps the generated OR predicate bounded so we don't hit JDBC bind-parameter limits or produce query
  plans that choke on large installs."
  500)

(def ^:private float-array-class
  "Cached `[F` class so [[parse-pgvector]] doesn't pay a `Class/forName` lookup per row."
  (Class/forName "[F"))

(defn- normalize-name [s]
  (some-> s str/trim u/lower-case-en))

(defn- prefer-new-row?
  "Return true when `new-row` should replace `prior` as the representative for a normalized name.
  `search-index-embedder` keeps exactly one embedding per normalized name, so the choice of winner
  is load-bearing: different rows carry different indexed text (name + description + other search
  fields) and therefore different embeddings, which changes downstream similarity comparisons.
  Priority chain (lowest wins, must be total so the result is stable across DB row order and batch
  boundaries):
   1. Numeric `:mid` (parsed `model_id`) — a parseable numeric id always beats a nil-parsed one;
      two numerics compare naturally.
   2. Raw `model_id` string — lexicographic; needed so `\"2\"` vs `\"02\"` (which parse equal) and
      two non-numeric ids still order deterministically.
   3. `:model` string — lexicographic final tie-break when `model_id` values are identical across
      different model types."
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
    (instance? float-array-class v) v
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

(defn- reduce-batched-rows
  "Fold `rf` over rows fetched from the pgvector index in batches of [[fetch-batch-size]] pairs.
  Never materializes the full row list — each batch is fetched, reduced into `acc`, and discarded
  before the next batch is fetched. Keeps peak memory to `O(batch + reduced-state)` instead of
  `O(total-rows)`, which matters because raw pgvector embedding strings are ~6–18KB each."
  [pgvector table-name pairs rf init]
  (reduce (fn [acc batch]
            (reduce rf acc (fetch-batch pgvector table-name batch)))
          init
          (partition-all fetch-batch-size pairs)))

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
      (log/debug t "Semantic-search index not available; search-index embedder will return {}"))))

(defn search-index-embedder
  "Embedder that reads vectors from the active semantic-search pgvector index. The indexed text
  combines name + description + other search fields, so the similarity signal reflects semantic
  overlap rather than name-only synonymy.
  Returns `{}` when the index isn't available (premium feature off, not yet initialized, datasource
  unreachable).

  Pgvector read failures (e.g. the index table exists but the query errors out) propagate so the
  caller can annotate its own error state — silently returning `{}` would look indistinguishable
  from \"no synonym matches\", which would let transient failures underreport complexity with no
  machine-readable signal. See [[metabase-enterprise.data-complexity-score.complexity/score-synonym-pairs]]
  for the wrapping `catch` that converts this into a `:error` field on the sub-score.

  When multiple entities share a normalized name but have different indexed embeddings the row
  chosen by [[prefer-new-row?]] wins, so the result is deterministic across runs regardless of
  batch boundaries.

  Parses embeddings as we fold so raw pgvector strings (6–18 KB each) aren't retained alongside
  the parsed float-arrays. Peak memory is still O(distinct-names) in float-arrays, which will
  matter on very large instances (>~50k entities) — the pairwise comparison downstream is the
  harder scaling problem and both will want to be revisited together (push similarity into
  pgvector SQL, or switch to HNSW approximate-neighbor)."
  [entities]
  (if-let [{:keys [pgvector table-name]} (try-active-index-state)]
    ;; No explicit `distinct` on `pairs`: callers pass entities from per-catalog SQL queries where
    ;; each `(kind, id)` maps to a unique primary key, so duplicates don't arise in practice. The
    ;; downstream `prefer-new-row?` fold already collapses any that slip through, so the only cost
    ;; of a hypothetical duplicate would be a slightly wider SQL `OR` clause.
    (let [pairs (for [{:keys [id kind]} entities
                      :let [m (metabot/entity-type->search-model kind)]
                      :when m]
                  [m (str id)])
          ;; Fold fetch → parse → dedup in one pass. `prefer-new-row?` keeps the winner globally
          ;; (lowest numeric model_id, then model as tie-break) so the result is stable across
          ;; runs regardless of which 500-row batch boundary a duplicate lands on.
          keyed (when (seq pairs)
                  (reduce-batched-rows
                   pgvector table-name pairs
                   (fn [acc {:keys [name model_id model embedding]}]
                     (if-let [vec (parse-pgvector embedding)]
                       (let [k     (normalize-name name)
                             entry {:mid      (parse-long model_id)
                                    :model    model
                                    :model_id model_id
                                    :vec      vec}
                             prior (get acc k)]
                         (if (or (nil? prior) (prefer-new-row? entry prior))
                           (assoc acc k entry)
                           acc))
                       acc))
                   {}))]
      (update-vals (or keyed {}) :vec))
    {}))

(defn active-embedding-model
  "Return the embedding model metadata for the *active* search index, not the current configuration.
  Returns nil when the index is unreachable, not yet initialized, or the feature is disabled.
  Use this instead of [[metabase-enterprise.semantic-search.env/get-configured-embedding-model]] when
  you need to know what model the index is *actually* serving — not just what the settings say."
  []
  (when-let [{:keys [model]} (try-active-index-state)]
    (when model
      {:provider   (:provider model)
       :model-name (:model-name model)})))
