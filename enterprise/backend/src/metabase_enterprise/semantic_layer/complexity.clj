(ns metabase-enterprise.semantic-layer.complexity
  "Computes a complexity score for the semantic layer of this Metabase instance.

  Two catalogs are scored independently:

    :library  — the curated subset (Cards of type :model and :metric)
    :universe — everything (library entities + all active physical tables)

  The score and its sub-scores are intentionally additive and close to the original back-of-envelope
  proposal so v1 output is easy to reason about. See notes in the plan file for deferred tuning ideas.

  The synonym sub-score is delegated to a pluggable embedder — see
  [[metabase-enterprise.semantic-layer.complexity-embedders]]. Default in prod reuses vectors from the
  semantic-search index so computing a score adds essentially no embedding cost."
  (:require
   [metabase-enterprise.semantic-layer.complexity-embedders :as embedders]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase.audit-app.core :as audit]
   [metabase.collections.core :as collections]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def formula-version
  "Bump when the scoring formula changes in a way that would break historical comparisons."
  1)

(def ^:private weights
  {:entity           10
   :name-collision   100
   :synonym-pair     50
   :field            1
   :repeated-measure 2})

(def ^:private synonym-similarity-threshold
  "Cosine similarity at or above which two names are flagged as synonyms.
  Mirrors the semantic search system's cosine-distance cutoff."
  (- 1 semantic-search/max-cosine-distance))

;;; ----------------------------------- enumeration -----------------------------------

(defn- table-field-counts
  "Return `{table-id field-count}` for active fields on the given `table-ids`. Single group-by query."
  [table-ids]
  (if (empty? table-ids)
    {}
    (into {}
          (map (juxt :table_id :field_count))
          (t2/query {:select   [:table_id [:%count.* :field_count]]
                     :from     [:metabase_field]
                     :where    [:and
                                [:= :active true]
                                [:in :table_id table-ids]]
                     :group-by [:table_id]}))))

(defn- table-measure-names
  "Return `{table-id [measure-name ...]}` for non-archived Measures on the given `table-ids`. A
  measure is a named MBQL aggregation attached to a Table — see [[metabase.measures.models.measure]]."
  [table-ids]
  (if (empty? table-ids)
    {}
    (->> (t2/select [:model/Measure :table_id :name]
                    :archived false
                    :table_id [:in table-ids])
         (reduce (fn [acc {:keys [table_id name]}]
                   (update acc table_id (fnil conj []) name))
                 {}))))

(defn- ->card-entity
  "Shape a Card row into an entity map for scoring. Cards don't contribute to `:field-count` in
  v1 — the proposal's +1-per-field rule is about physical Table fields, not Card result columns —
  so we can skip the fat `result_metadata` column entirely. Measures are a separate first-class
  model tied to Tables, not Cards, so Cards also don't contribute to `:measure-names`."
  [{:keys [id name type]}]
  {:id            id
   :name          name
   :kind          (keyword type)
   :field-count   0
   :measure-names []})

(defn- ->table-entity [field-counts measure-names {:keys [id name]}]
  {:id            id
   :name          name
   :kind          :table
   :field-count   (get field-counts id 0)
   :measure-names (get measure-names id [])})

(defn- library-collection-ids
  "Set of collection IDs that make up the Library (root + descendants). Empty when the instance has no Library yet."
  []
  (or (when-let [root (collections/library-collection)]
        (into #{(:id root)} (collections/descendant-ids root)))
      #{}))

(defn- collect-card-entities
  "Stream Cards matching `filter-kvs` via a reducible select over the minimum columns we need,
  folding each row straight into an entity map. No `result_metadata` — see [[->card-entity]] — so
  the per-row footprint is tiny regardless of how many Cards live on the instance.

  `:card_schema` is included because `:model/Card` requires it for post-select hooks even when we
  don't otherwise use it."
  [filter-kvs]
  (into []
        (map ->card-entity)
        (apply t2/reducible-select [:model/Card :id :name :type :card_schema] filter-kvs)))

(defn- assemble-table-entities [tables]
  (let [table-ids     (mapv :id tables)
        field-counts  (table-field-counts table-ids)
        measure-names (table-measure-names table-ids)]
    (mapv #(->table-entity field-counts measure-names %) tables)))

(defn- library-entities
  "Entities in the `:library` catalog — non-archived model/metric Cards and published Tables that
  live anywhere in the Library collection tree. Returns an empty vector when no Library exists."
  []
  (let [collection-ids (library-collection-ids)]
    (if (empty? collection-ids)
      []
      (let [card-entities (collect-card-entities [:type          [:in ["metric" "model"]]
                                                  :archived      false
                                                  :collection_id [:in collection-ids]])
            tables        (t2/select [:model/Table :id :name]
                                     :active        true
                                     :is_published  true
                                     :collection_id [:in collection-ids])]
        (into card-entities (assemble-table-entities tables))))))

(defn- universe-entities
  "Entities in the `:universe` catalog — every non-archived model/metric Card and every active
  physical Table on this instance (excluding audit content)."
  []
  (let [card-entities (collect-card-entities [:type         [:in ["metric" "model"]]
                                              :archived     false
                                              :database_id  [:not= audit/audit-db-id]])
        tables        (t2/select [:model/Table :id :name]
                                 :active true
                                 :db_id  [:not= audit/audit-db-id])]
    (into card-entities (assemble-table-entities tables))))

;;; ------------------------------------- scoring -------------------------------------

(defn- repeated-count
  "Number of occurrences past the first for a grouping-count `n`. 3 identical items = 2 repeats."
  [^long n]
  (max 0 (dec n)))

(defn- score-entity-count [entities]
  (let [n (count entities)]
    {:count n
     :score (* n (:entity weights))}))

(defn- score-name-collisions [entities]
  (let [groups  (->> entities
                     (keep (comp embedders/normalize-name :name))
                     frequencies
                     vals
                     (filter #(> % 1)))
        repeats (reduce + 0 (map repeated-count groups))]
    {:pairs repeats
     :score (* repeats (:name-collision weights))}))

(defn- score-field-count [entities]
  (let [n (reduce + 0 (map #(or (:field-count %) 0) entities))]
    {:count n
     :score (* n (:field weights))}))

(defn- score-repeated-measures [entities]
  (let [repeats (->> entities
                     (mapcat :measure-names)
                     (keep embedders/normalize-name)
                     frequencies
                     vals
                     (map repeated-count)
                     (reduce +))]
    {:count repeats
     :score (* repeats (:repeated-measure weights))}))

(defn- dot ^double [^floats a ^floats b]
  (let [len (alength a)]
    (loop [i 0 acc 0.0]
      (if (< i len)
        (recur (inc i) (+ acc (* (aget a i) (aget b i))))
        acc))))

(defn- synonym-pair?
  "True when two vectors' cosine similarity is ≥ sqrt(`threshold-sq`). Uses the squared form of
  the inequality — `(a·b)² ≥ t² · ‖a‖² · ‖b‖²` when `a·b ≥ 0` — so we avoid the two `Math/sqrt`
  calls a direct cosine-similarity computation would need per pair. The non-negative guard keeps
  the squaring step sound (squaring a negative `a·b` would flip the inequality).

  `norms-product` is `‖a‖² · ‖b‖²` precomputed by the caller; folding it into one arg keeps us
  within Clojure's 4-argument cap for primitive-typed `defn`s."
  [^floats a ^floats b ^double norms-product ^double threshold-sq]
  (let [dot-ab (dot a b)]
    (and (>= dot-ab 0.0)
         (>= (* dot-ab dot-ab) (* threshold-sq norms-product)))))

(defn- synonym-pair-count
  "Count of vector pairs whose cosine similarity is ≥ `threshold`. Walks the upper triangle of the
  N×N pair matrix; each vector's `‖v‖²` is precomputed once and reused across every comparison it
  participates in.

  TODO: this is O(N²) in the distinct-name count. Fine while the signal source is the shared
  search-index (bounded by what the indexer has seen), but once we introduce a dedicated name-only
  embedder this should revisit — either as a chunked `M·Mᵀ` via Neanderthal/dtype-next or as a
  dedicated pgvector name-index doing the join in SQL."
  [embeddings threshold]
  (let [n                 (count embeddings)
        threshold-sq      (* threshold threshold)
        ^doubles norms-sq (double-array n)]
    (dotimes [i n]
      (let [v ^floats (embeddings i)]
        (aset norms-sq ^long i (dot v v))))
    (count
     (for [i (range n)
           j (range (inc ^long i) n)
           :when (synonym-pair? (embeddings i) (embeddings j)
                                (* (aget norms-sq i) (aget norms-sq j))
                                threshold-sq)]
       :value-doesnt-matter))))

(defn- score-synonym-pairs
  "Compute the synonym sub-score for `entities` using `embedder`. Returns zero (with a warning
  logged) if the embedder yields no vectors or throws. A nil `embedder` naturally produces an empty
  lookup and falls through to zero."
  [entities embedder]
  (try
    (let [name->vec     (or (and embedder (embedder entities)) {})
          ;; We need to materialize all these vectors in a clojure vec for efficient pairwise similarity checks.
          known-vectors (into []
                              (comp (keep (comp embedders/normalize-name :name))
                                    (distinct)
                                    (keep name->vec))
                              entities)
          pairs         (synonym-pair-count known-vectors synonym-similarity-threshold)]
      {:pairs pairs
       :score (* pairs (:synonym-pair weights))})
    (catch Throwable t
      (log/warn t "Complexity score: synonym detection failed; falling back to 0")
      {:pairs 0 :score 0 :error (.getMessage t)})))

(defn score-catalog
  "Pure: compute the score breakdown for a catalog given its `entities` and an optional `embedder`."
  [entities embedder]
  (let [components {:entity-count      (score-entity-count entities)
                    :name-collisions   (score-name-collisions entities)
                    :synonym-pairs     (score-synonym-pairs entities embedder)
                    :field-count       (score-field-count entities)
                    :repeated-measures (score-repeated-measures entities)}]
    {:total      (reduce + 0 (map (comp :score val) components))
     :components components}))

;;; ----------------------------------- public API ------------------------------------

(defn complexity-scores
  "Compute the complexity score for the `:library` and `:universe` catalogs of this Metabase instance.

  Returns a map of the shape:

    {:library  {:total n :components {...}}
     :universe {:total n :components {...}}
     :meta     {:formula-version 1
                :synonym-threshold 0.30
                :embedding-model {...}}}

  Optional opts:
    :embedder — embedder function (see `complexity-embedders`). Defaults to `search-index-embedder` so scoring reuses
                existing vectors and adds no embedding cost. Pass `nil` to disable synonym scoring."
  ([] (complexity-scores nil))
  ([{:keys [embedder] :as opts}]
   (let [embedder (if (contains? opts :embedder)
                    embedder
                    semantic-search/search-index-embedder)]
     {:library  (score-catalog (library-entities) embedder)
      :universe (score-catalog (universe-entities) embedder)
      :meta     {:formula-version   formula-version
                 :synonym-threshold synonym-similarity-threshold
                 ;; Record which embedding model the search-index is using so benchmarks can pin it.
                 ;; nil if semantic search isn't available.
                 :embedding-model
                 (try
                   (when-let [model (semantic.env/get-configured-embedding-model)]
                     {:provider   (:provider model)
                      :model-name (:model-name model)})
                   (catch Throwable _ nil))}})))
