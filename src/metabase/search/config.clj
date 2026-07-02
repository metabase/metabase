(ns metabase.search.config
  (:require
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.permissions.core :as perms]
   [metabase.search.settings :as search.settings]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def ^:dynamic *db-max-results*
  "Number of raw results to fetch from the database. This number is in place to prevent massive application DB load by
  returning tons of results; this number should probably be adjusted downward once we have UI in place to indicate
  that results are truncated.

  Under normal situations it shouldn't be rebound, but it's dynamic to make unit testing easier."
  1000)

(def ^:const max-filtered-results
  "Number of results to return in an API response"
  1000)

(def ^:const stale-time-in-days
  "Results older than this number of days are all considered to be equally old. In other words, there is a ranking
  bonus for results newer than this (scaled to just how recent they are). c.f. `search.scoring/recency-score`"
  30)

(def ^:const dashboard-count-ceiling
  "Results in more dashboards than this are all considered to be equally popular."
  10)

(def ^:const view-count-scaling-percentile
  "The percentile of the given search model's view counts, to be multiplied by [[view-count-scaling]].
  The larger this value, the longer it will take for the score to approach 1.0. It will never quite reach it."
  0.99)

(def ^:const surrounding-match-context
  "Show this many words of context before/after matches in long search results"
  2)

(def model->db-model
  "Mapping of model name to :db_model and :alias"
  api/model->db-model)

;; We won't need this once fully migrated to specs, but kept for now in case legacy cod falls out of sync
(def excluded-models
  "Set of models that should not be included in search results."
  #{"dashboard-card"
    "dashboard-tab"
    "dimension"
    "permissions-group"
    "pulse"
    "pulse-card"
    "pulse-channel"
    "snippet"
    "timeline"
    "user"})

;; TODO we could almost replace this using the spec, but there are two blockers
;; - We do not cover index-entity yet
;; - We also need to provide an alias (and this must match the API one for legacy)
(def model-to-db-model
  "Mapping from string model to the Toucan model backing it."
  (apply dissoc model->db-model excluded-models))

(def all-models
  "Set of all valid models to search for. "
  (set (keys model-to-db-model)))

(def curated-search-models
  "Search models that can carry a curation signal, so the `:curated?` filter restricts to these (and
  keeps them consistent across the appdb and in-place engines). Includes `table`, which is exactly why
  curated content stays visible where the older verified-only filter dropped it (BOT-1536)."
  #{"card" "dataset" "metric" "dashboard" "table"})

(def models-search-order
  "The order of this list influences the order of the results: items earlier in the
  list will be ranked higher."
  ["dashboard" "metric" "segment" "measure" "indexed-entity" "card" "dataset" "collection" "table" "action" "document" "transform" "database"])

(assert (= all-models (set models-search-order)) "The models search order has to include all models")

(def static-default-weights
  "Base scorer weights that every search inherits.
  Each context layers its overrides on top (see [[static-context-weights]] and [[weights]])."
  {:pinned              0
   :bookmarked          1
   :recency             1
   :user-recency        5
   :dashboard           0
   :model               2
   :view-count          2
   :text                5
   :mine                1
   ;; An exact (case-insensitive) name match is the strongest single intent signal: :exact (100) overpowers
   ;; any one curation tier (the :data-picker boosts: :library 80, :official-collection / :verified 35 each).
   ;; Base text/recency scorers (0–5) only break ties within a tier.
   :exact               100
   :prefix              0
   ;; Curation badges act as tie-breakers by default; the :data-picker context boosts them (to 35 each).
   :official-collection 1
   :verified            1
   ;; :library is a data-layer curation signal relevant only when picking a data source, so it is off by
   ;; default; the :data-picker context opts in, at a curation-tier level that an exact match can overpower.
   :library             0
   ;; RRF is the "Reciprocal Rank Fusion" score used by the semantic search backend to blend semantic and keyword scores
   :rrf                 500
   ;; Maps the backend's cosine distance to a [0, 1] score: 1 = identical vector, 0 = maximally distant or keyword-only hit.
   :semantic-distance   10})

(def static-context-weights
  "Per-context scorer overrides, keyed by [[normalized-contexts]].
  Merged onto [[static-default-weights]] for that context (see [[weights]])."
  {:global
   {:prefix               5
    :model/collection     1
    :model/dashboard      1
    :model/metric         1
    :model/dataset        0.8
    :model/table          0.8
    :model/indexed-entity 0.5
    :model/database       0.5
    :model/question       0}
   :entity-picker
   {:model/table    1
    :model/dataset  1
    :model/metric   1
    :model/question 0}
   :data-picker
   ;; Boost curated items when picking a data source, but keep them curation-tier signals that an exact
   ;; name match (:exact 100) can overpower. :library outweighs :official-collection and :verified even
   ;; combined (70), so library membership trumps those badges here.
   {:library             80
    :official-collection 35
    :verified            35}
   ;; TODO: lift :data-layer up to :default. It's a structural signal (every visible warehouse
   ;; table gets `data_layer "final"`), so the +33 boost flips orderings across every search
   ;; surface and breaks e2e specs that pin specific top results. To make progress:
   ;;
   ;; - Update the e2e snapshot in `e2e/snapshot-creators/default.cy.snap.js` so the sample-DB
   ;;   tables aren't all at `final` (mark non-essential ones `internal`/`hidden`), or
   ;; - Rewrite the brittle assertions to not depend on a specific top result.
   ;;
   ;; Affected specs (broken by an earlier lift attempt):
   ;;
   ;; - `search.cy.spec.js`
   ;; - `models.cy.spec.js`
   ;; - `documents.cy.spec.ts`
   ;; - `document-links.cy.spec.ts`
   ;; - `custom-viz.cy.spec.ts`
   ;; - `search-snowplow.cy.spec.js`
   :metabot
   {:data-layer          33
    :data-layer/final    1     ; ≈ 33
    :data-layer/internal 0.3   ; ≈ 10
    :data-layer/hidden   0.03  ; ≈ 1
    }})

(def known-rankers
  "Scorer keys the weights API accepts as overrides: the union across [[static-default-weights]] and every
  [[static-context-weights]] profile.
  Namespaced scorer params (e.g. `:model/dashboard`) collapse to their namespace (`:model`)."
  (into #{}
        (map #(if (namespace %) (keyword (namespace %)) %))
        (concat (keys static-default-weights)
                (mapcat keys (vals static-context-weights)))))

(def ^:private FilterDef
  "A relaxed definition, capturing how we can write the filter - with some fields omitted."
  [:map {:closed true}
   [:key                               :keyword]
   [:type                              :keyword]
   [:field            {:optional true} :string]
   [:context-key      {:optional true} :keyword]
   [:supported-value? {:optional true} ifn?]
   [:required-feature {:optional true} :keyword]
   [:engine           {:optional true} :keyword]])

(def ^:private Filter
  "A normalized representation, for the application to leverage."
  [:map {:closed true}
   [:key              :keyword]
   [:type             :keyword]
   [:field            :string]
   [:context-key      :keyword]
   [:supported-value? ifn?]
   [:required-feature [:maybe :keyword]]
   [:engine           [:maybe :keyword]]])

(mu/defn- build-filter :- Filter
  [{k :key t :type :keys [context-key field supported-value? required-feature engine]} :- FilterDef]
  {:key              k
   :type             (keyword "metabase.search.filter" (name t))
   :field            (or field (u/->snake_case_en (name k)))
   :context-key      (or context-key k)
   :supported-value? (or supported-value? (constantly true))
   :required-feature required-feature
   :engine           (or engine :all)})

(mu/defn- build-filters :- [:map-of :keyword Filter]
  [m]
  (-> (reduce #(assoc-in %1 [%2 :key] %2) m (keys m))
      (update-vals build-filter)))

(def filters
  "Specifications for the optional search filters."
  (build-filters
   {:archived                {:type :single-value, :context-key :archived?}
    :collection-id           {:type :collection-hierarchy, :context-key :collection}
    ;; TODO dry this alias up with the index hydration code
    :created-at              {:type :date-range, :field "model_created_at"}
    :creator-id              {:type :list, :context-key :created-by}
    ;; This actually has nothing to do with tables, as we also filter cards, it would be good to rename the context key.
    :database-id             {:type :single-value, :context-key :table-db-id}
    :id                      {:type :list, :context-key :ids, :field "model_id"}
    :last-edited-at          {:type :date-range}
    :last-editor-id          {:type :list, :context-key :last-edited-by}
    :native-query            {:type :native-query, :context-key :search-native-query}
    :verified                {:type :single-value, :supported-value? #{true}, :required-feature :content-verification}
    ;; "Verified or curated content" (Metabot). Backed by the precomputed `curated` index column
    ;; (an OR over verified + official + library/published + authoritative, computed at ingestion),
    ;; so the filter is a single indexed boolean. No :required-feature: a signal can only be set while
    ;; its feature is present, so the precomputed flag is already feature-correct.
    :curated                 {:type :single-value, :context-key :curated?, :supported-value? #{true}}
    :non-temporal-dim-ids    {:type :single-value :engine :appdb}
    :has-temporal-dim        {:type :single-value :engine :appdb}
    :display-type            {:type :list, :field "display_type"}}))

(def ^:private filter-defaults-by-context
  ;; Keyed by [[normalized-contexts]] plus a `:default` base; the broad-search surfaces share `:global`.
  {:default {:archived                            false
             ;; keys will typically those in [[filters]], but this is an atypical filter.
             ;; we plan to generify it, by precalculating it on the index.
             :filter-items-in-personal-collection "all"}
   :global  {:filter-items-in-personal-collection "exclude-others"}})

(defn filter-default
  "Get the default value for the given filter in the given context."
  [_engine context filter-key]
  (let [fetch (fn [ctx] (when ctx (-> filter-defaults-by-context (get ctx) (get filter-key))))]
    (or (fetch context) (fetch :default))))

(declare normalized-context)

(defn- normalize-override-keys
  "Re-key persisted weight overrides ([[search.settings/experimental-search-weight-overrides]]) by
  [[normalized-context]], merging overrides whose alias has since collapsed onto the surviving context.
  Legacy flat `{scorer weight}` overrides fold into the `:default` base, losing to an explicit `:default`."
  [overrides]
  (let [;; legacy overrides (pre-#50338) were a flat {scorer weight} map with no context layer, so they
        ;; applied to every context; these are the entries whose value is a bare weight, not a per-context map
        legacy (into {} (remove (comp map? val)) overrides)
        nested (reduce-kv (fn [acc context weight-overrides]
                            (let [normalized (normalized-context context)]
                              (update acc normalized
                                      ;; when an alias and its normalized context both carry overrides the
                                      ;; normalized one wins -- it's what the weights API writes today
                                      (if (= context normalized)
                                        #(merge % weight-overrides)
                                        #(merge weight-overrides %)))))
                          {}
                          ;; sorted so the winner is deterministic when several aliases collapse to one
                          ;; normalized context (the normalized key still wins; among aliases the lowest-sorted)
                          (into (sorted-map) (filter (comp map? val)) overrides))]
    (cond-> nested
      ;; :default feeds every context, so folding the flat weights there preserves their global reach
      (seq legacy) (update :default #(merge legacy %)))))

;; This gets called *a lot* during a search request, so we'll almost certainly need to optimize it. Maybe just TTL.
(defn weights
  "Strength of the various scorers. Copied from metabase.search.in-place.scoring, but allowing divergence."
  ([]
   (weights {}))
  ([{request-overrides :weights, :keys [context]}]
   (let [context          (or context :default)
         system-overrides (normalize-override-keys (search.settings/experimental-search-weight-overrides))]
     (if (= :all context)
       (merge-with merge (assoc static-context-weights :default static-default-weights) system-overrides)
       (merge static-default-weights
              ;; Not sure which of the next two should have precedence, arguments for both "¯\_(ツ)_/¯"
              (get system-overrides :default)
              (get static-context-weights context)
              (get system-overrides context)
              request-overrides)))))

(defn weight
  "The relative strength the corresponding score has in influencing the total score."
  [search-ctx scorer-key]
  (get (weights search-ctx) scorer-key (when-not (namespace scorer-key) 0)))

(defn scorer-param
  "Get a nested parameter scoped to the given scorer"
  [search-ctx scorer-key param-key]
  (let [flat-key (keyword (name scorer-key) (name param-key))]
    (weight search-ctx flat-key)))

(defn model->alias
  "Given a model string returns the model alias"
  [model]
  (-> model model-to-db-model :alias))

(mu/defn column-with-model-alias :- keyword?
  "Given a column and a model name, Return a keyword representing the column with the model alias prepended.

  (column-with-model-alias \"card\" :id) => :card.id)"
  [model-string :- ms/KeywordOrString
   column       :- ms/KeywordOrString]
  (keyword (str (name (model->alias model-string)) "." (name column))))

(def SearchableModel
  "Schema for searchable models"
  (into [:enum] all-models))

(def vector-search-strategies
  "Valid semantic-search vector-search strategies, as keywords. Mastered here (rather than in the EE module)
  so the OSS search API param and the EE semantic-search setting validation share one definition.
  Note: the per-strategy dispatch in [[metabase-enterprise.semantic-search.index/semantic-search-query]] is a
  separate dispatch (unknown strategies fall back to `:brute-force`) and must be updated by hand when
  adding a strategy.

   - `:hnsw`                   approximate, index-backed, post-filters the candidate set
   - `:brute-force`            exact, filter-first full scan (skips the index)
   - `:hnsw-iterative-relaxed` index-backed iterative scan, filters inline, results in approximate distance
                               order (pgvector `hnsw.iterative_scan = relaxed_order`)
   - `:hnsw-iterative-strict`  as above but exact distance order (`hnsw.iterative_scan = strict_order`)

  The iterative scan keeps pulling neighbours until the limit is met or `hnsw.max_scan_tuples` is hit; the
  `ef-search` and `max-scan-tuples` knobs tune it further."
  [:hnsw :brute-force :hnsw-iterative-relaxed :hnsw-iterative-strict])

(def hnsw-index-backed-strategies
  "The subset of [[vector-search-strategies]] that read the HNSW index. Selecting one of these must build the
  index just-in-time, and a query under one must fail fast when the index is missing. `:brute-force` is the
  only strategy that needs no index."
  #{:hnsw :hnsw-iterative-relaxed :hnsw-iterative-strict})

(def ^:private ui-contexts
  "Search `context` values issued by the frontend, one per UI surface.
  Selects ranking weights ([[static-context-weights]]) and filter defaults ([[filter-defaults-by-context]]).
  Keep in sync with the frontend `SearchContext` type (frontend/src/metabase-types/api/search.ts).
  Give every value a comment naming the surface that issues it."
  [:basic-actions       ; the command palette's basic-actions "do any models exist?" gate (New action), not a user search
   :browse              ; the Browse models / Browse metrics pages
   :command-palette     ; the ⌘K command palette
   :data-picker         ; picking a data source (table/model/metric) while building a query
   :dependencies        ; the dependency-graph entry search (EE)
   :document            ; entity references embedded in documents
   :embedding-setup     ; embedding/SDK setup and preview resource selection
   :entity-picker       ; the entity-picker modal (cards, dashboards, collections, …)
   :library             ; the data-studio Library page (EE)
   :model-migration     ; the migrate-models admin page (EE)
   :search-app          ; the full-page search results app
   :search-bar          ; the global navbar search typeahead
   :type-filter])       ; the search type-filter dropdown's available-models lookup

(def ^:private non-ui-contexts
  "Search `context` values for non-frontend callers.
  Excluded from the frontend `SearchContext` type so the frontend cannot use them."
  [:api       ; programmatic / third-party API access
   :metabot]) ; Metabot / agent API searches; accepted over HTTP too, for debugging and reproduction

(def ^:private contexts
  "All valid search request `context` values: [[ui-contexts]] plus [[non-ui-contexts]]."
  (into ui-contexts non-ui-contexts))

(def Context
  "Malli enum for the search request `context` query parameter, over every value in [[contexts]].
  The `:decode/string keyword` hook coerces the query-string value (e.g. \"search-app\") to a keyword."
  (into [:enum {:decode/string keyword}] contexts))

(def context->normalized-context
  "Collapses search `context` values that should rank and filter alike onto a shared normalized context.
  Only genuine remappings appear here; an unlisted context normalizes to itself and inherits `:default`.
  Add an entry to make a surface share another's ranking/filter profile; omit it to keep the surface's own."
  ;; TODO (Chris 2026-06-08) -- the nav search bar is deliberately left off `:global` for now so it keeps
  ;; the default filters/weights; decide whether any of its behaviour should be DRYed up with the other
  ;; broad-search surfaces.
  {:search-app      :global
   :command-palette :global
   :type-filter     :global})

(assert (every? (set contexts) (keys context->normalized-context))
        "context->normalized-context keys must be valid contexts")

(def normalized-contexts
  "Context values [[normalized-context]] can return: the remap targets plus every un-remapped context.
  [[static-context-weights]] and [[filter-defaults-by-context]] are keyed by these (each also has a
  `:default` base entry)."
  (into (set (vals context->normalized-context))
        (remove (set (keys context->normalized-context)))
        contexts))

(def NormalizedContext
  "Malli enum schema for a normalized search context (see [[normalized-contexts]])."
  (into [:enum] (sort normalized-contexts)))

(defn normalized-context
  "Normalize a search `context` for weight and filter-default lookup.
  Contexts that should behave alike collapse to a shared value; all others map to themselves.
  Also used by the `/api/search/weights` endpoints so stored/read override keys agree with search."
  [context]
  (get context->normalized-context context context))

(assert (every? (partial mr/validate NormalizedContext) (keys static-context-weights))
        "static-context-weights must be keyed by normalized contexts")

(def SearchContext
  "Map with the various allowed search parameters, used to construct the SQL query."
  [:map {:closed true}
   ;; display related
   [:calculate-available-models? {:optional true} :boolean]
   ;;
   ;; required
   ;;
   [:archived?          [:maybe :boolean]]
   [:current-user-id    pos-int?]
   [:is-superuser?      :boolean]
   [:is-data-analyst?   :boolean]
   ;; TODO only optional and maybe for tests, clean that up!
   [:context               {:optional true} [:maybe :keyword]]
   [:is-impersonated-user? {:optional true} [:maybe :boolean]]
   [:is-sandboxed-user?    {:optional true} [:maybe :boolean]]
   [:current-user-perms [:set perms/PathSchema]]
   [:model-ancestors?   :boolean]
   [:models             [:set SearchableModel]]
   ;; TODO this is optional only for tests, clean those up!
   [:search-engine      {:optional true} keyword?]
   ;; Semantic-engine vector-search strategy (see [[search.config/vector-search-strategies]]). When absent,
   ;; the engine uses its configured default setting. The remaining vector-search-* knobs are experimental
   ;; tuning parameters; they only affect the `:hnsw-iterative-*` strategies (except `explain?`, which works
   ;; for any strategy). Each falls back to its EE setting default when absent.
   [:vector-search-strategy        {:optional true} [:maybe keyword?]]
   ;; pgvector `hnsw.ef_search` -- HNSW candidate-list size
   [:vector-search-ef-search       {:optional true} [:maybe pos-int?]]
   ;; pgvector `hnsw.max_scan_tuples` -- soft cap on tuples an iterative scan visits
   [:vector-search-max-scan-tuples {:optional true} [:maybe pos-int?]]
   ;; true to run gated EXPLAIN (ANALYZE) instrumentation of the inner vector subquery (expensive)
   [:vector-search-explain?        {:optional true} [:maybe :boolean]]
   ;; true to `SET LOCAL enable_seqscan = off` to force the planner onto the HNSW index (experiment knob;
   ;; deliberately not exposed over HTTP)
   [:vector-search-force-index?    {:optional true} [:maybe :boolean]]
   [:search-string      {:optional true} [:maybe ms/NonBlankString]]
   [:weights            {:optional true} [:maybe [:map-of :keyword number?]]]
   ;;
   ;; optional
   ;;
   [:collection                          {:optional true} [:maybe ms/PositiveInt]]
   [:created-at                          {:optional true} ms/NonBlankString]
   [:created-by                          {:optional true} [:set {:min 1} ms/PositiveInt]]
   [:display-type                        {:optional true} [:set {:min 1} ms/NonBlankString]]
   [:filter-items-in-personal-collection {:optional true} [:enum "all" "only" "only-mine" "exclude" "exclude-others"]]
   [:last-edited-at                      {:optional true} ms/NonBlankString]
   [:last-edited-by                      {:optional true} [:set {:min 1} ms/PositiveInt]]
   [:limit-int                           {:optional true} ms/Int]
   [:offset-int                          {:optional true} ms/Int]
   [:search-native-query                 {:optional true} :boolean]
   [:table-db-id                         {:optional true} ms/PositiveInt]
   ;; true to search for verified items only, nil will return all items
   [:verified                            {:optional true} true?]
   ;; true to restrict to verified-or-curated content (precomputed `curated` index column)
   [:curated?                            {:optional true} true?]
   [:ids                                 {:optional true} [:set {:min 1} ms/PositiveInt]]
   [:include-dashboard-questions?        {:optional true} :boolean]
   [:include-metadata?                   {:optional true} :boolean]
   [:non-temporal-dim-ids                {:optional true} ms/NonBlankString]
   [:has-temporal-dim                    {:optional true} :boolean]
   [:enabled-transform-source-types      [:set ms/NonBlankString]]])

(defmulti column->string
  "Turn a complex column into a string"
  {:arglists '([column-value model column-name])}
  (fn [_column-value model column-name]
    [(keyword model) column-name]))

(defmethod column->string :default
  [value _ _]
  value)

(defmethod column->string [:card :dataset_query]
  [value _ _]
  (or (when-let [query (not-empty ((lib-be/transform-query :out) value))]
        (when (lib/native-only-query? query)
          (lib/raw-native-query query)))
      ""))
