(ns metabase-enterprise.semantic-layer.complexity
  "Computes a complexity score for the semantic layer of this Metabase instance.

  Three catalogs are scored:

    :library  — the curated subset (Cards of type :model and :metric)
    :universe — everything (library entities + all active physical tables)
    :metabot  — what the internal Metabot can actually surface. Tables are always filtered to
                Metabot-visible tables (active, `:visibility_type IS NULL`, non-routed database,
                non-audit) so hidden/routed tables don't inflate the score; this matches the
                search/table filters Metabot actually applies. Cards optionally narrow further
                when the caller passes `:metabot-scope {:verified-only? <bool> :collection-id
                <nil|Long>}` describing how the internal Metabot filters retrieval — restricting
                Cards to a `collection_id` subtree, to verified-moderation Cards, or both. The
                caller owns the scope decision — this namespace does not read settings,
                premium-feature gates, or Metabot rows directly.

  The score and its sub-scores are intentionally additive and close to the original back-of-envelope
  proposal so v1 output is easy to reason about.
  See notes in the plan file for deferred tuning ideas.

  The synonym sub-score is delegated to a pluggable embedder — see
  [[metabase-enterprise.semantic-layer.complexity-embedders]].
  Default in prod reuses vectors from the semantic-search index so computing a score adds essentially no
  embedding cost."
  (:require
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [metabase-enterprise.semantic-layer.complexity-embedders :as embedders]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.audit-app.core :as audit]
   [metabase.collections.core :as collections]
   [metabase.util :as u]
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

(def ^:private component->group
  "Thematic parent per sub-component — drives the `<group>.total` + `<group>.<component>` rollup in
  emitted keys so operators can tell `size` from `ambiguity` without SQL.
  Must cover every key produced by [[score-catalog]] or the missing ones emit as `nil.<component>`."
  {:entity-count      :size
   :field-count       :size
   :name-collisions   :ambiguity
   :synonym-pairs     :ambiguity
   :repeated-measures :ambiguity})

(def synonym-similarity-threshold
  "Cosine-similarity cutoff for flagging two names as synonyms.
  Higher than semantic-search's retrieval cutoff (0.30) because scoring wants precision, not recall.
  Eyeballed against stats-appdb samples; see `test_resources/semantic_layer/analysis/2026_04_21_data_analysis_summary.md`.
  Hard-coded so it can drift independently from the search cutoff."
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
   live anywhere in the Library collection tree (excluding audit content, so `:library` stays a
   subset of `:universe`)."
  []
  (let [collection-ids (library-collection-ids)]
    (if (empty? collection-ids)
      []
      (let [card-entities (collect-card-entities [:type          [:in ["metric" "model"]]
                                                  :archived      false
                                                  :collection_id [:in collection-ids]
                                                  :database_id   [:not= audit/audit-db-id]])
            tables        (t2/select [:model/Table :id :name]
                                     :active        true
                                     :is_published  true
                                     :collection_id [:in collection-ids]
                                     :db_id         [:not= audit/audit-db-id])]
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

(defn- metabot-table-entities
  "Tables the internal Metabot would actually surface. Mirrors the search/table filters applied by
   `metabase.warehouse_schema.models.table` and `metabase.metabot.table-utils` — active, not hidden
   (`:visibility_type IS NULL`), not a routed-database table (`db.router_database_id IS NULL`),
   not the audit DB — so hidden/routed tables don't inflate the `:metabot` catalog."
  []
  (t2/select [:model/Table :id :name]
             {:select    [:metabase_table.id :metabase_table.name]
              :from      [:metabase_table]
              :left-join [[:metabase_database :db] [:= :db.id :metabase_table.db_id]]
              :where     [:and
                          [:= :metabase_table.active true]
                          [:= :metabase_table.visibility_type nil]
                          [:= :db.router_database_id nil]
                          [:not= :metabase_table.db_id audit/audit-db-id]]}))

(defn- metabot-entities
  "Entities in the `:metabot` catalog. Cards match Metabot's retrieval (metric/model, non-archived,
   non-audit, optionally narrowed by `collection_id` subtree and/or verified-moderation). Tables are
   filtered through [[metabot-table-entities]] so hidden and routed-DB tables are excluded, matching
   what Metabot/search can actually surface."
  [scope]
  (let [card-entities (metabot-card-entities scope)
        tables        (metabot-table-entities)]
    (into card-entities (assemble-table-entities tables))))

;;; ------------------------------------- scoring -------------------------------------

(defn- component-score
  "Sub-score map: raw `:measurement` (double — future-proofs non-integer axes like density) and
  weighted `:score` using the weight at `weight-key`."
  [weight-key n]
  {:measurement (double n)
   :score       (* n (get weights weight-key))})

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
  (component-score :entity (count entities)))

(defn- score-name-collisions [entities]
  (component-score :name-collision (repeated-names (map :name entities))))

(defn- score-field-count [entities]
  (component-score :field (reduce + (map #(or (:field-count %) 0) entities))))

(defn- score-repeated-measures [entities]
  (component-score :repeated-measure (repeated-names (mapcat :measure-names entities))))

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
  "Compute the synonym sub-score for `entities` using `embedder`. On embedder failure, returns nil
   `:score`/`:measurement` plus an `:error` string so the failure cascades through aggregates
   instead of being mistaken for a real zero. A nil `embedder` produces an empty lookup and scores
   a real zero."
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
      (component-score :synonym-pair pairs))
    (catch Throwable t
      (log/warn t "Complexity score: synonym detection failed; cascading nil through aggregates")
      (let [msg (some-> (.getMessage t) str/trim)
            err (if (str/blank? msg)
                  (or (some-> (class t) .getName) "synonym detection failed")
                  msg)]
        {:measurement nil :score nil :error err}))))

(defn- nil-safe-sum
  "Sum `xs` (numbers and/or nils). Returns nil if any element is nil — used to cascade an
   uncomputed sub-score through aggregates instead of silently low-biasing the total with zeros."
  [xs]
  (when (every? some? xs)
    (reduce + xs)))

(defn score-catalog
  "Pure: compute the score breakdown for a catalog given its `entities` and an optional `embedder`."
  [entities embedder]
  (let [components {:entity-count      (score-entity-count entities)
                    :name-collisions   (score-name-collisions entities)
                    :synonym-pairs     (score-synonym-pairs entities embedder)
                    :field-count       (score-field-count entities)
                    :repeated-measures (score-repeated-measures entities)}]
    {:total      (nil-safe-sum (map (comp :score val) components))
     :components components}))

;;; ----------------------------------- public API ------------------------------------

(defn- log-scores!
  "Log the result at :info so operators see the score in app logs even when Snowplow is off."
  [result]
  (log/info (str "Semantic complexity score:\n"
                 ;; `pprint` goes through `with-out-str`, not `*out*`, so the "use metabase.util.log" lint is n/a.
                 #_{:clj-kondo/ignore [:discouraged-var]}
                 (with-out-str (pprint/pprint result)))))

(defn- parameters-map
  "Sorted-map of scoring inputs likely to evolve, published as a JSON object on each event.
  String keys so they round-trip unchanged — Snowplow's `payload` only snake-cases top-level keys,
  and Cheshire would serialize nested keyword keys with their leading colon.
  Excludes `formula_version` — that stays top-level as the primary cross-version filter."
  [{:keys [synonym-threshold embedding-model]}]
  (cond-> (sorted-map "synonym_threshold" synonym-threshold)
    embedding-model (assoc "embedding_model_provider" (:provider embedding-model)
                           "embedding_model_name"     (:model-name embedding-model))))

(defn- snake ^String [x]
  (str/replace (name x) "-" "_"))

(defn- dotted-key
  "Join `parts` with `.` after snake-casing each. `(dotted-key :size :entity-count)` → `\"size.entity_count\"`."
  [& parts]
  (str/join "." (map snake parts)))

(defn- emit-snowplow!
  "One Snowplow event per (catalog × dotted-key) — grand `total`, one `<group>.total` per thematic
  group, and one `<group>.<component>` leaf per sub-score. Aggregate `:score` is nil when any
  contributing leaf couldn't be computed, so consumers see an explicit unknown instead of a
  silently low-biased total."
  [{:keys [library universe metabot meta]}]
  (let [base {:event           :data_complexity_scoring
              :formula_version (:formula-version meta)
              :parameters      (parameters-map meta)}]
    (doseq [[catalog result] [[:library library] [:universe universe] [:metabot metabot]]]
      ;; grand total
      (analytics/track-event!
       :snowplow/data_complexity
       (assoc base :catalog catalog :key (dotted-key :total) :score (:total result)))
      ;; per-group rollups
      (doseq [[group entries] (group-by #(component->group (key %)) (:components result))]
        (analytics/track-event!
         :snowplow/data_complexity
         (assoc base
                :catalog catalog
                :key     (dotted-key group :total)
                :score   (nil-safe-sum (map (comp :score val) entries)))))
      ;; leaves
      (doseq [[component sub] (:components result)
              :let [group (component->group component)]]
        (analytics/track-event!
         :snowplow/data_complexity
         (cond-> (assoc base
                        :catalog     catalog
                        :key         (dotted-key group component)
                        :score       (:score sub)
                        :measurement (:measurement sub))
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
        paying for a redundant pass — callers loading entities from a representation file have no
        way to reconstruct Metabot's visibility filters and should either pass a pre-filtered
        vector here or accept the universe approximation."
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

(defn- time-phase!
  "Run `f`, record duration under `phase` on the timing histogram, return its value."
  [phase f]
  (let [timer (u/start-timer)]
    (try
      (f)
      (finally
        (prometheus/observe! :metabase-semantic-layer/complexity-score-duration-ms
                             {:phase phase}
                             (u/since-ms timer))))))

(defn complexity-scores
  "Compute the complexity score for the `:library`, `:universe`, and `:metabot` catalogs of this
   Metabase instance. Returns a map of the shape:

     {:library  {:total n :components {...}}
      :universe {:total n :components {...}}
      :metabot  {:total n :components {...}}
      :meta     {:formula-version 1
                 :synonym-threshold 0.90
                 :embedding-model {...}}}

   Options:
     `:embedder` — overrides the synonym-axis embedder (defaults to
        [[metabase-enterprise.semantic-search.core/search-index-embedder]]); pass `nil` to disable
        synonym scoring.
     `:metabot-scope` — a `{:verified-only? <bool> :collection-id <nil|Long>}` map describing how
        the internal Metabot filters Cards. `:metabot` is always scored separately from `:universe`
        because Metabot/search table visibility (hidden tables, routed databases) already diverges
        from the raw `:universe` set; the scope only narrows Cards further. The caller owns the
        scope decision (premium-feature gate + Metabot row lookup) so this namespace stays free of
        settings/feature/Metabot-row reads."
  [& {:keys [embedder metabot-scope] :as opts}]
  ;;; NOTE: we fully materialize a vector off all entities, along with one of those in the library, rather than
  ;;; returning reducibles. For very large instances that holds a non-trivial slim-entity list in memory
  ;;; (name, kind, field-count, measure-names — no fat columns like `result_metadata`),
  ;;; but each catalog is consumed by FIVE sub-score functions that each walk the collection, so making this
  ;;; reducible would re-query the app-db five times per scoring call — a worse tradeoff than the bounded memory
  ;;; we currently will currently consume (provided we have that memory).
  (let [total-timer (u/start-timer)]
    (try
      (let [embedder       (if (contains? opts :embedder)
                             embedder
                             semantic-search/search-index-embedder)
            model-meta     (when (= embedder semantic-search/search-index-embedder)
                             (semantic-search/active-embedding-model))
            library-ents   (time-phase! "enumerate-library" library-entities)
            universe-ents  (time-phase! "enumerate-universe" universe-entities)
            metabot-ents   (time-phase! "enumerate-metabot" #(metabot-entities metabot-scope))
            universe-score (time-phase! "score-universe" #(score-catalog universe-ents embedder))
            library-score  (time-phase! "score-library"  #(score-catalog library-ents embedder))
            metabot-score  (time-phase! "score-metabot"  #(score-catalog metabot-ents embedder))
            result         {:library  library-score
                            :universe universe-score
                            :metabot  metabot-score
                            :meta     (cond-> {:formula-version   formula-version
                                               :synonym-threshold synonym-similarity-threshold}
                                        model-meta (assoc :embedding-model model-meta))}]
        (log-scores! result)
        (let [published? (try
                           (emit-snowplow! result)
                           true
                           (catch Throwable t
                             (log/warn t "Failed to publish complexity score to Snowplow")
                             false))]
          ;; Tag publish success via metadata so scheduler/boot callers can gate durable side-effects
          ;; (fingerprint advance) without leaking into the JSON API response shape.
          (with-meta result {::snowplow-published? published?})))
      (finally
        (prometheus/observe! :metabase-semantic-layer/complexity-score-duration-ms
                             {:phase "total"}
                             (u/since-ms total-timer))))))

(comment
  (complexity-scores))
