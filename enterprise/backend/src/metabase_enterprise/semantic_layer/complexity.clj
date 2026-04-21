(ns metabase-enterprise.semantic-layer.complexity
  "Computes a complexity score for the semantic layer of this Metabase instance.

  Three catalogs are scored:

    :library  — the curated subset (Cards of type :model and :metric)
    :universe — everything (library entities + all active physical tables)
    :metabot  — what the internal Metabot can actually surface. Identical to :universe unless the
                caller passes `:metabot-scope {:verified-only? <bool> :collection-id <nil|Long>}`
                describing how the internal Metabot filters retrieval — restricting Cards to a
                `collection_id` subtree, to verified-moderation Cards, or both. When the scope is
                empty we reuse the universe score verbatim so we don't pay for a redundant pass.
                Tables pass through unfiltered (no table-level verification concept, and Metabot
                doesn't scope Tables by `collection_id` either). The caller owns the decision —
                this namespace does not read settings, premium-feature gates, or Metabot rows
                directly.

  The score and its sub-scores are intentionally additive and close to the original back-of-envelope
  proposal so v1 output is easy to reason about.
  See notes in the plan file for deferred tuning ideas.

  The synonym sub-score is delegated to a pluggable embedder — see
  [[metabase-enterprise.semantic-layer.complexity-embedders]].
  Default in prod reuses vectors from the semantic-search index so computing a score adds essentially no
  embedding cost."
  (:require
   [clojure.pprint :as pprint]
   [metabase-enterprise.semantic-layer.complexity-embedders :as embedders]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase.analytics.core :as analytics]
   [metabase.audit-app.core :as audit]
   [metabase.collections.core :as collections]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def formula-version
  "Bump when the scoring formula changes in a way that would break historical comparisons.
  v2 raised the synonym-similarity threshold from 0.30 to 0.90, so pre-v2 and v2+ synonym-pair
  sub-scores are not directly comparable."
  2)

(def ^:private weights
  {:entity           10
   :name-collision   100
   :synonym-pair     50
   :field            1
   :repeated-measure 2})

(def ^:private synonym-similarity-threshold
  "Cosine similarity at or above which two entity names are flagged as synonyms.
  Deliberately higher than the semantic-search retrieval cutoff (0.30): search optimises for recall
  (\"return anything plausibly relevant\") while the complexity score needs precision (\"these are
  confusingly similar\"). 0.90 was chosen by eyeballing sample pairs from the stats appdb at
  multiple thresholds — see
  `enterprise/backend/test_resources/semantic_layer/analysis/2026_04_21_data_analysis_summary.md`
  for the calibration data."
  0.90)

;;; ----------------------------------- enumeration -----------------------------------
;;;
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
  (into #{}
        (when-let [root (collections/library-collection)]
          ;; This is cheaper and less brittle than referencing the collection type constants for every entity type.
          (cons (:id root) (collections/descendant-ids root)))))

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

(defn- metabot-collection-scope-ids
  "Set of collection IDs the internal Metabot can see — its `collection_id` plus descendants.
   nil when no collection scope is configured (Metabot retrieves from everywhere). If the
   collection row can't be loaded (stale/invalid id) we still return a singleton set with the
   raw id so the catalog matches `metabot-metrics-and-models-query`, which filters on the raw
   `collection_id` and returns an empty result rather than dropping the filter."
  [collection-id]
  (when collection-id
    (into #{collection-id}
          (when-let [root (t2/select-one :model/Collection :id collection-id)]
            (collections/descendant-ids root)))))

(defn- metabot-card-entities
  "Cards the internal Metabot would actually surface — metric/model, non-archived, non-audit,
   optionally restricted to a `collection_id` subtree and/or to verified-moderation Cards. Mirrors
   the filters in `metabase.metabot.tools.util/metabot-metrics-and-models-query` (skipping the
   per-user visible-collection clause — the complexity score is a global signal) so the
   `:metabot` catalog agrees with what Metabot would actually retrieve."
  [{:keys [verified-only? collection-id]}]
  (let [collection-ids (metabot-collection-scope-ids collection-id)
        where          (cond-> [:and
                                [:in :report_card.type [:inline ["metric" "model"]]]
                                [:= :report_card.archived false]
                                [:not= :report_card.database_id audit/audit-db-id]]
                         collection-ids (conj [:in :report_card.collection_id collection-ids])
                         verified-only? (conj [:= :mr.status [:inline "verified"]]))
        query          (cond-> {:select [:report_card.id :report_card.name :report_card.type :report_card.card_schema]
                                :from   [[:report_card]]
                                :where  where}
                         verified-only? (assoc :left-join
                                               [[:moderation_review :mr]
                                                [:and
                                                 [:= :mr.moderated_item_id :report_card.id]
                                                 [:= :mr.moderated_item_type [:inline "card"]]
                                                 [:= :mr.most_recent true]]]))]
    (into []
          (map ->card-entity)
          (t2/reducible-select :model/Card query))))

(defn- metabot-entities
  "Entities in the `:metabot` catalog when any Metabot retrieval scope is in effect —
   verified-moderation filtering, a `collection_id` subtree, or both. Cards are filtered to match
   Metabot's retrieval; Tables pass through unfiltered because Metabot doesn't scope Tables by
   `collection_id` and there's no table-level verification concept."
  [scope]
  (let [card-entities (metabot-card-entities scope)
        tables        (t2/select [:model/Table :id :name]
                                 :active true
                                 :db_id  [:not= audit/audit-db-id])]
    (into card-entities (assemble-table-entities tables))))

;;; ------------------------------------- scoring -------------------------------------

(defn- component-score
  "Build a sub-score map: `n` under `count-key` (`:count` or `:pairs`), plus the weighted total
   under `:score`. `weight-key` selects which weight from [[weights]]."
  [count-key weight-key n]
  {count-key n
   :score    (* n (get weights weight-key))})

(defn- repeated-names
  "Count of name occurrences past the first (normalized for comparison). Single pass, no
   intermediate frequency map. `raw-names` may contain nils — they're skipped."
  [raw-names]
  (second
   (reduce (fn [[seen repeats] raw-name]
             (if-let [n-name (embedders/normalize-name raw-name)]
               (if (contains? seen n-name)
                 [seen (inc repeats)]
                 [(conj seen n-name) repeats])
               [seen repeats]))
           [#{} 0]
           raw-names)))

(defn- score-entity-count [entities]
  (component-score :count :entity (count entities)))

(defn- score-name-collisions [entities]
  (component-score :pairs :name-collision (repeated-names (map :name entities))))

(defn- score-field-count [entities]
  (component-score :count :field (reduce + 0 (map #(or (:field-count %) 0) entities))))

(defn- score-repeated-measures [entities]
  (component-score :count :repeated-measure (repeated-names (mapcat :measure-names entities))))

(defn- dot ^double [^floats a ^floats b]
  (let [len (alength a)]
    (loop [i 0 acc 0.0]
      (if (< i len)
        (recur (inc i) (+ acc (* (aget a i) (aget b i))))
        acc))))

(defn- synonym-pair?
  "True when two vectors' cosine similarity is ≥ sqrt(`threshold-sq`).
   Uses the squared form of the inequality — `(a·b)² ≥ t² · ‖a‖² · ‖b‖²` when `a·b ≥ 0`, avoiding
   two `Math/sqrt` calls a direct cosine-similarity computation would need.
   The non-negative guard keeps it sound (squaring a negative `a·b` would flip the inequality).

   `norms-product` is `‖a‖² · ‖b‖²` precomputed by the caller; folding it into one arg keeps us
   within Clojure's 4-argument cap for primitive-typed `defn`s."
  [^floats a ^floats b ^double norms-product ^double threshold-sq]
  (and (pos? norms-product)
       (let [dot-ab (dot a b)]
         (and (>= dot-ab 0.0)
              (>= (* dot-ab dot-ab) (* threshold-sq norms-product))))))

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
      (component-score :pairs :synonym-pair pairs))
    (catch Throwable t
      (log/warn t "Complexity score: synonym detection failed; falling back to 0")
      (assoc (component-score :pairs :synonym-pair 0)
             :error (.getMessage t)))))

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

(defn- log-scores!
  "Local sink for the computed result. Ensures operators can see the score in application logs
   regardless of whether Snowplow emission is enabled (anonymous analytics may be off, or the
   collector unreachable), since scoring runs only at startup and on the superuser recompute
   endpoint — no Prometheus gauge replaces this."
  [result]
  (log/info (str "Semantic complexity score:\n"
                 ;; `pprint` here is just string formatting for the logger.
                 ;; we never write to `*out*` directly, so the "use metabase.util.log" lint doesn't apply.
                 #_{:clj-kondo/ignore [:discouraged-var]}
                 (with-out-str (pprint/pprint result)))))

(defn- emit-snowplow!
  "Publish one Snowplow event per (catalog × axis) — the aggregate total plus each of the five
   sub-scores, for each of the three catalogs. Mirrors the Prometheus `{:catalog :axis}` label
   shape we used previously so existing analysis habits carry over."
  [{:keys [library universe metabot meta]}]
  (let [{:keys [formula-version synonym-threshold embedding-model]} meta
        base (cond-> {:event             :semantic_complexity_scored
                      :formula_version   formula-version
                      :synonym_threshold synonym-threshold}
               embedding-model (assoc :embedding_model_provider (:provider embedding-model)
                                      :embedding_model_name    (:model-name embedding-model)))]
    (doseq [[catalog result] [[:library library] [:universe universe] [:metabot metabot]]]
      (analytics/track-event!
       :snowplow/semantic_complexity
       (assoc base :catalog catalog :axis :total :score (:total result)))
      (doseq [[axis sub] (:components result)
              :let [measurement (or (:count sub) (:pairs sub))]]
        (analytics/track-event!
         :snowplow/semantic_complexity
         (cond-> (assoc base :catalog catalog :axis axis :score (:score sub))
           measurement  (assoc :measurement measurement)
           (:error sub) (assoc :error (:error sub))))))))

(defn score-from-entities
  "Pure: compute the full complexity score from pre-built entity vectors and an embedder. No DB
   access, no Snowplow emission — suitable for callers that have already loaded their entities
   from another source (e.g., a representation file).

   Options:
     `:embedding-model-meta` — `{:provider ... :model-name ...}` map embedded into the response's
        `:meta`, or nil to omit the key. Callers that know what embedding model they used should
        pass it so benchmark consumers can pin to it.
     `:metabot-entities` — when non-nil, scored separately as the `:metabot` catalog. When nil
        (default), `:metabot` reuses the `:universe` score so the response shape is stable without
        paying for a redundant pass."
  [library-entities universe-entities embedder {:keys [embedding-model-meta metabot-entities]}]
  (let [universe-score (score-catalog universe-entities embedder)]
    {:library  (score-catalog library-entities embedder)
     :universe universe-score
     :metabot  (if metabot-entities
                 (score-catalog metabot-entities embedder)
                 universe-score)
     :meta     (cond-> {:formula-version   formula-version
                        :synonym-threshold synonym-similarity-threshold}
                 embedding-model-meta (assoc :embedding-model embedding-model-meta))}))

(defn- metabot-scope-applies?
  "True when the supplied `:metabot-scope` actually narrows retrieval vs. `:universe`. Used to
   decide whether we need a separate `:metabot` pass or can cheaply reuse `:universe`."
  [{:keys [verified-only? collection-id]}]
  (or (boolean verified-only?) (some? collection-id)))

(defn complexity-scores
  "Compute the complexity score for the `:library`, `:universe`, and `:metabot` catalogs of this
   Metabase instance. Returns a map of the shape:

     {:library  {:total n :components {...}}
      :universe {:total n :components {...}}
      :metabot  {:total n :components {...}}
      :meta     {:formula-version 2
                 :synonym-threshold 0.90
                 :embedding-model {...}}}

   Options:
     `:embedder` — overrides the synonym-axis embedder (defaults to
        [[metabase-enterprise.semantic-search.core/search-index-embedder]]); pass `nil` to disable
        synonym scoring.
     `:metabot-scope` — a `{:verified-only? <bool> :collection-id <nil|Long>}` map describing how
        the internal Metabot filters retrieval. When either key is active, `:metabot` is scored
        against Cards matching the scope (Tables pass through); when neither is active (or the
        option is omitted), `:metabot` reuses the `:universe` score. The caller owns this decision
        (premium-feature gate + Metabot row lookup) so this namespace stays free of
        settings/feature/Metabot-row reads."
  [& {:keys [embedder metabot-scope] :as opts}]
  ;;; NOTE: we fully materialize a vector off all entities, along with one of those in the library, rather than
  ;;; returning reducibles. For very large instances that holds a non-trivial slim-entity list in memory
  ;;; (name, kind, field-count, measure-names — no fat columns like `result_metadata`),
  ;;; but each catalog is consumed by FIVE sub-score functions that each walk the collection, so making this
  ;;; reducible would re-query the app-db five times per scoring call — a worse tradeoff than the bounded memory
  ;;; we currently will currently consume (provided we have that memory).
  (let [embedder   (if (contains? opts :embedder)
                     embedder
                     semantic-search/search-index-embedder)
        model-meta (when (= embedder semantic-search/search-index-embedder)
                     (semantic-search/active-embedding-model))
        result     (score-from-entities (library-entities)
                                        (universe-entities)
                                        embedder
                                        {:embedding-model-meta model-meta
                                         :metabot-entities     (when (metabot-scope-applies? metabot-scope)
                                                                 (metabot-entities metabot-scope))})]
    (log-scores! result)
    (try
      (emit-snowplow! result)
      (catch Throwable t
        (log/warn t "Failed to publish complexity score to Snowplow")))
    result))

(comment
  (complexity-scores))
