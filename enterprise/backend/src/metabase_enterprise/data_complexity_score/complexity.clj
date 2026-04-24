(ns metabase-enterprise.data-complexity-score.complexity
  "Computes the Data Complexity Score for the semantic layer across three catalogs:
    :library  — the curated subset (Cards of type :model and :metric)
    :universe — everything (library entities + all active physical tables)
    :metabot  — what the internal Metabot can surface, narrowed by a caller-supplied scope."
  (:require
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.audit-app.core :as audit]
   [metabase.collections.core :as collections]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def formula-version
  "Bump when the scoring formula changes in a way that would break historical comparisons.
  Swaps of `embedding-model`, `synonym-threshold`, or `text-variant` don't need a bump — they
  already ride in the fingerprint + `:meta` + Snowplow parameters, so downstream readers can
  diff on those fields directly."
  1)

(def weights
  "Per-axis weights applied to raw measurements. Public because they're part of the scoring
  fingerprint — a tuning change must force a re-score and be visible to Snowplow consumers
  without bumping `formula-version`."
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
  "Cosine-similarity cutoff for flagging two names as synonyms, paired with the fixed
  MiniLM-L6-v2 STS model in `complexity-embedders/default-synonym-model`. Higher than
  semantic-search's retrieval cutoff (0.30) because scoring needs precision, not recall.
  See https://linear.app/metabase/document/synonym-analysis-21-april-2026-31c8ce76eddb for how
  this value was chosen."
  0.80)

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
    (u/group-by :table_id :name
                (t2/select [:model/Measure :table_id :name]
                           :archived false
                           :table_id [:in table-ids]))))

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

(defn- verified-card-id-set
  "Set of Card ids whose most-recent moderation review is `verified`. Called only when
   `metabot-scope` requests verified-only filtering — avoids a `moderation_review` join on the
   universe Card select by pushing the check into a small auxiliary lookup."
  []
  (t2/select-fn-set :moderated_item_id :model/ModerationReview
                    :moderated_item_type "card"
                    :most_recent         true
                    :status              "verified"))

(defn- routed-child-database-id-set
  "Set of database ids whose `router_database_id` is non-nil — the routed child databases whose
   tables Metabot/search hide. Tables with `:db_id` in this set are excluded from the `:metabot`
   catalog, mirroring the table-visibility rule in `metabase.warehouse-schema.models.table`."
  []
  (t2/select-fn-set :id :model/Database :router_database_id [:not= nil]))

(defn- pick-by-row
  "Filter `entities` by `row-pred` applied to the correspondingly-indexed `rows`. Preserves
   reference identity on the kept entity maps so library/metabot vectors share map instances
   with the universe vector rather than allocating fresh ones.
   A nil `row-pred` short-circuits to `[]` — callers whose filter is statically empty (e.g. no
   Library collections on this instance) pass nil to skip enumeration entirely."
  [row-pred rows entities]
  (if row-pred
    (into []
          (keep-indexed (fn [i row] (when (row-pred row) (nth entities i))))
          rows)
    []))

(defn- enumerate-catalogs
  "One-pass enumeration of all three scoring catalogs. Returns
   `{:library [...] :universe [...] :metabot [...]}` where entity maps are shared *by reference*
   across catalogs — a Card or Table that appears in more than one catalog is one map in memory,
   not three.

   An earlier revision fetched the three catalogs separately, which duplicated DB work up to 3×
   per scoring run — most expensively on [[table-field-counts]] and [[table-measure-names]],
   each a `GROUP BY` scan over `metabase_field` / `measure`. We now fetch the universe superset
   once and derive the `:library` and `:metabot` subsets by in-memory filter, which collapses 6
   DB round-trips + 2 auxiliaries into 4 + up-to-2 and lets the aggregates run once each.

   `metabot-scope` is `{:verified-only? <bool> :collection-id <nil|Long>}` describing how the
   internal Metabot narrows its Cards further — it only adds filters, never widens. The caller
   owns the scope decision (premium-feature gate + Metabot row lookup); this namespace does not
   read settings, premium-feature gates, or Metabot rows directly."
  [{:keys [verified-only? collection-id]}]
  (let [library-cids      (library-collection-ids)
        metabot-cids      (metabot-collection-scope-ids collection-id)
        verified-ids      (when verified-only? (verified-card-id-set))
        routed-db-ids     (routed-child-database-id-set)
        ;; Extra columns (`:collection_id`, `:is_published`, `:visibility_type`, `:db_id`) are
        ;; selected purely to drive the in-memory library/metabot derivations below — they're
        ;; ignored by `->card-entity` / `->table-entity`. `:card_schema` is required by
        ;; `:model/Card`'s post-select hooks even when we don't otherwise use it.
        universe-cards    (t2/select [:model/Card :id :name :type :collection_id :card_schema]
                                     :type        [:in ["metric" "model"]]
                                     :archived    false
                                     :database_id [:not= audit/audit-db-id])
        universe-tables   (t2/select [:model/Table :id :name :collection_id :is_published
                                      :visibility_type :db_id]
                                     :active true
                                     :db_id  [:not= audit/audit-db-id])
        field-counts      (table-field-counts  (mapv :id universe-tables))
        measure-names     (table-measure-names (mapv :id universe-tables))
        card-entities     (mapv ->card-entity universe-cards)
        table-entities    (mapv #(->table-entity field-counts measure-names %) universe-tables)
        in-library-card?  (when (seq library-cids)
                            (fn [{:keys [collection_id]}]
                              (contains? library-cids collection_id)))
        in-library-table? (when (seq library-cids)
                            (fn [{:keys [collection_id is_published]}]
                              (and is_published
                                   (contains? library-cids collection_id))))
        in-metabot-card?  (when (and (or (nil? metabot-cids) (seq metabot-cids))
                                     (or (not verified-only?) (seq verified-ids)))
                            (fn [{:keys [collection_id id]}]
                              (and (or (nil? metabot-cids)
                                       (contains? metabot-cids collection_id))
                                   (or (not verified-only?)
                                       (contains? verified-ids id)))))
        in-metabot-table? (fn [{:keys [visibility_type db_id]}]
                            (and (nil? visibility_type)
                                 (not (contains? routed-db-ids db_id))))]
    {:universe (into card-entities table-entities)
     :library  (into (pick-by-row in-library-card?  universe-cards  card-entities)
                     (pick-by-row in-library-table? universe-tables table-entities))
     :metabot  (into (pick-by-row in-metabot-card?  universe-cards  card-entities)
                     (pick-by-row in-metabot-table? universe-tables table-entities))}))

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
  (component-score :field (reduce + (keep :field-count entities))))

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

(defn- snake ^String [x]
  (str/replace (name x) "-" "_"))

(defn- dotted-key
  "Join `parts` with `.` after snake-casing each. `(dotted-key :size :entity-count)` → `\"size.entity_count\"`."
  [& parts]
  (str/join "." (map snake parts)))

(defn- parameters-map
  "Sorted-map of scoring inputs likely to evolve, published as a JSON object on each event.
  String keys (top-level and nested) so they round-trip unchanged — Snowplow's `payload` only
  snake-cases top-level keys, and Cheshire would serialize nested keyword keys with their leading
  colon. Excludes `formula_version` — that stays top-level as the primary cross-version filter."
  [{:keys [synonym-threshold embedding-model text-variant weights]}]
  (cond-> (sorted-map "synonym_threshold" synonym-threshold
                      "weights"           (into (sorted-map)
                                                (map (fn [[k v]] [(snake k) v]))
                                                weights))
    embedding-model (assoc "embedding_model_provider" (:provider embedding-model)
                           "embedding_model_name"     (:model-name embedding-model))
    text-variant    (assoc "text_variant" (snake text-variant))))

(def ^:private max-error-length
  "Matches the Snowplow schema's `error` maxLength — a pathological exception message
  must not fail validation and drop the whole event."
  1024)

(defn- truncate-error [s]
  (cond-> s (< max-error-length (count s)) (subs 0 max-error-length)))

(defn- emit-snowplow!
  "Submits Snowplow events for every score, every group aggregation, and the grand total.
  Returns true when they are all successfully delivered.
  Returns false when tracking is disabled or any emission failed."
  [{:keys [library universe metabot meta]}]
  (let [base   {:event           :data_complexity_scoring
                :formula_version (:formula-version meta)
                :parameters      (parameters-map meta)}
        events (for [[catalog result] [[:library library] [:universe universe] [:metabot metabot]]
                     event (concat (for [[component sub] (:components result)]
                                     ;; leaf component
                                     (cond-> (assoc base
                                                    :catalog     catalog
                                                    :key         (dotted-key (component->group component) component)
                                                    :score       (:score sub)
                                                    :measurement (:measurement sub))
                                       (:error sub) (assoc :error (truncate-error (:error sub)))))
                                   (for [[group entries] (group-by #(component->group (key %)) (:components result))]
                                     ;; group total
                                     (assoc base
                                            :catalog catalog
                                            :key     (dotted-key group :total)
                                            :score   (nil-safe-sum (map (comp :score val) entries))))
                                   ;; grand total
                                   [(assoc base
                                           :catalog catalog
                                           :key     (dotted-key :total)
                                           :score   (:total result))])]
                 event)]
    ;; No short-circuiting - even if they are failures, attempt the rest.
    (reduce (fn [all-ok? event]
              (and (analytics/track-event! :snowplow/data_complexity event) all-ok?))
            ;; Since events cannot be empty, we don't need to worry about returning a vacuous true.
            true
            events)))

(defn- time-phase!
  "Run `f`, record duration on the per-phase histogram labelled by `stage` and `catalog`, return its value."
  [stage catalog f]
  (let [timer (u/start-timer)]
    (try
      (f)
      (finally
        (prometheus/observe! :metabase-data-complexity/phase-duration-ms
                             {:stage stage :catalog catalog}
                             (u/since-ms timer))))))

(defn complexity-scores
  "Compute the complexity score for the `:library`, `:universe`, and `:metabot` catalogs of this
   Metabase instance. Returns a map of the shape:

     {:library  {:total n :components {...}}
      :universe {:total n :components {...}}
      :metabot  {:total n :components {...}}
      :meta     {:formula-version 1
                 :synonym-threshold 0.80
                 :embedding-model {:provider ... :model-name ...}
                 :text-variant :names-split}}

   `:embedding-model` and `:text-variant` are present only when the default synonym embedder is
   in use — an explicit `:embedder` means the caller owns the model + preprocessing narrative.

   Options:
     `:embedder` — overrides the synonym-axis embedder (defaults to
        [[metabase-enterprise.data-complexity-score.complexity-embedders/default-synonym-embedder]],
        a MiniLM-L6-v2 embedder called through ollama); pass `nil` to disable synonym scoring.
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
                             embedders/default-synonym-embedder)
            default?       (= embedder embedders/default-synonym-embedder)
            model-meta     (when default?
                             (select-keys embedders/default-synonym-model [:provider :model-name]))
            text-variant   (when default? embedders/default-text-variant)
            {:keys [library universe metabot]}
            ;; Single enumerate phase — see [[enumerate-catalogs]]. Library ⊆ universe and
            ;; metabot ⊆ universe, so fetching each catalog separately duplicated DB work; the
            ;; catalog label `"all"` on the enumerate stage reflects that one pass covers all
            ;; three. Per-catalog timing only applies to the pure scoring step.
            (time-phase! "enumerate" "all" #(enumerate-catalogs metabot-scope))
            universe-score (time-phase! "score" "universe" #(score-catalog universe embedder))
            library-score  (time-phase! "score" "library"  #(score-catalog library  embedder))
            metabot-score  (time-phase! "score" "metabot"  #(score-catalog metabot  embedder))
            result         {:library  library-score
                            :universe universe-score
                            :metabot  metabot-score
                            :meta     (cond-> {:formula-version   formula-version
                                               :synonym-threshold synonym-similarity-threshold}
                                        model-meta   (assoc :embedding-model model-meta)
                                        text-variant (assoc :text-variant    text-variant))}]
        (log-scores! result)
        (let [published? (try
                           (emit-snowplow! result)
                           (catch Throwable t
                             (log/warn t "Failed to publish complexity score to Snowplow")
                             false))]
          ;; `emit-snowplow!` returns true only when every event reached the tracker (false when
          ;; Snowplow is disabled or any emission failed) — scheduler/boot callers gate
          ;; `data-complexity-scoring-last-fingerprint` on this so a disabled collector or any
          ;; partial failure doesn't silently mark the fingerprint as published.
          (with-meta result {::snowplow-published? published?})))
      (finally
        (prometheus/observe! :metabase-data-complexity/scoring-duration-ms
                             (u/since-ms total-timer))))))

(comment
  (complexity-scores))
