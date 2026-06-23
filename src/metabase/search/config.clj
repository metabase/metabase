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
  separate `case` (with an `:hnsw` default) and must be updated by hand when adding a strategy."
  [:hnsw :brute-force])

(def PartitionConfig
  "Schema for the semantic-engine federated-retrieval partition config (the `partition_config`
  API param, sent as a JSON object). `:partitions` lists per-partition candidate generation: each
  partition searches its own `:models` set as one sub-query with its own candidate ceiling (`:k`),
  cosine cutoff (`:max-cosine-distance`), and vector `:strategy`. An absent param is today's single
  global KNN, so absent-param = baseline.

  The partition model groupings MUST mirror the partial HNSW indexes built on the active index table
  (search-eval scripts/manage_index.py) -- the backend emits `model = '<m>'` / `model = ANY (...)`
  predicates that have to imply the partial-index predicate or the planner ignores it. Mastered here
  (rather than in the EE module) so the OSS search API param and the EE query builder share one
  definition. `:fusion` selects the post-union ranking; only `:v1` (union → existing RRF+scoring) is
  implemented today."
  [:map {:closed true}
   [:partitions [:sequential
                 [:map {:closed true}
                  [:name                {:optional true} :string]
                  [:models              [:sequential SearchableModel]]
                  [:strategy            {:optional true} (into [:enum] vector-search-strategies)]
                  [:k                   {:optional true} pos-int?]
                  [:max-cosine-distance {:optional true} [:double {:min 0.0 :max 2.0}]]]]]
   [:fusion {:optional true} [:enum :v1]]])

(def MultiViewConfig
  "Schema for the semantic-engine multi-view-embeddings config (the `multi_view_config` API param, sent as
  a JSON object). `:views` lists the embedding columns to pool: each view runs its own per-column KNN with
  its own candidate ceiling (`:k`), the per-view candidates are UNION-ed, and the per-entity minimum cosine
  distance across views (`LEAST`, i.e. max-similarity) is kept. A single `:max-cosine-distance` gates the
  pooled distance; per-view cutoffs are a later (`:v2`) refinement and are not honored today. An absent
  param is today's single global KNN, so absent-param = baseline.

  The base `embedding` column MUST be one of the views -- it is the only column covering every entity
  (`indexed-entity` and unenriched rows ride it), so it is the retrievability floor; synthetic views only
  *add* recall. The view columns MUST exist on the active index table and each synthetic column MUST have a
  partial HNSW index `WHERE <col> IS NOT NULL` (search-eval scripts/manage_index.py set-views) -- the
  backend emits exactly that predicate per synthetic view or the planner ignores the index. `:column` is
  interpolated as a raw SQL identifier, so it is constrained to the `embedding`/`embedding_<suffix>` shape.
  Mastered here (rather than in the EE module) so the OSS search API param and the EE query builder share
  one definition. `:pool` selects the cross-view pooling; only `:least` (group-min over the union) is
  implemented today."
  [:map {:closed true}
   [:views [:sequential
            [:map {:closed true}
             [:name                {:optional true} :string]
             [:column              [:re #"^embedding(_[a-z0-9_]+)?$"]]
             [:k                   {:optional true} pos-int?]
             ;; Accepted for forward-compat with the eval-side query config; not honored in v1 (a single
             ;; top-level :max-cosine-distance gates the pooled distance instead).
             [:max-cosine-distance {:optional true} [:double {:min 0.0 :max 2.0}]]]]]
   [:max-cosine-distance {:optional true} [:double {:min 0.0 :max 2.0}]]
   [:pool {:optional true} [:enum :least]]])

(def FederatedMultiViewConfig
  "Schema for the semantic-engine config that *composes* federated retrieval with multi-view embeddings
  (the `federated_multi_view_config` API param, sent as a JSON object). It is the Cartesian product of
  [[PartitionConfig]] and [[MultiViewConfig]]: `:partitions` lists per-partition candidate generation
  (model set, candidate ceiling `:k`, cosine cutoff, vector `:strategy`) exactly as federation does, and
  each partition additionally carries its own `:views` -- the embedding columns to pool *within* that
  partition. The backend runs one model-scoped KNN per (partition, view), pools the per-view candidates to
  one row per entity by minimum cosine distance (`LEAST`), applies the partition's cutoff + quota, then
  UNION-s across partitions and recomputes `semantic_rank`. An absent param is today's single global KNN.

  Each partition's `:views` MUST include the base `embedding` column (the retrievability floor covering
  `indexed-entity` and unenriched rows). For a partition whose `:strategy` is `:hnsw`, every synthetic view
  must be backed by a *composite* partial HNSW index `WHERE <model-pred> AND <col> IS NOT NULL` on the active
  table (search-eval scripts/manage_index.py set-federated-views) -- the backend emits exactly that predicate
  so the planner can stay filter-first; without it Postgres falls back to the multi-view index and
  post-filters the model set (correct, but reintroduces crowding). Brute-force partitions need no index.
  Model groupings, view columns, and composite indexes form a three-way contract that must stay in sync.
  Mastered here (rather than in the EE module) so the OSS search API param and the EE query builder share one
  definition. `:pool` (`:least`) and `:fusion` (`:v1`) select pooling/ranking; only those values are
  implemented today. Per-view cutoffs are accepted but not honored (a single per-partition cutoff gates)."
  [:map {:closed true}
   [:partitions [:sequential
                 [:map {:closed true}
                  [:name                {:optional true} :string]
                  [:models              [:sequential SearchableModel]]
                  [:strategy            {:optional true} (into [:enum] vector-search-strategies)]
                  [:k                   {:optional true} pos-int?]
                  [:max-cosine-distance {:optional true} [:double {:min 0.0 :max 2.0}]]
                  [:views [:sequential
                           [:map {:closed true}
                            [:name                {:optional true} :string]
                            [:column              [:re #"^embedding(_[a-z0-9_]+)?$"]]
                            [:k                   {:optional true} pos-int?]
                            [:max-cosine-distance {:optional true} [:double {:min 0.0 :max 2.0}]]]]]]]]
   [:max-cosine-distance {:optional true} [:double {:min 0.0 :max 2.0}]]
   [:pool {:optional true} [:enum :least]]
   [:fusion {:optional true} [:enum :v1]]])

(def rerank-blend-modes
  "Valid `:blend` selectors for [[RerankerConfig]], as keywords. Each names how the cross-encoder's
  per-doc relevance score recombines with the existing scorers in the final sort:
   - `:rerank_only`       -- final score = the rerank score alone (boosts dropped).
   - `:rerank_then_boost` -- final score = `weight*rerank + Σ metadata boosts`, dropping the relevance-core
                             scorers (`:rrf`, `:semantic-distance`) the cross-encoder supersedes. The default
                             and the smallest faithful change (the boosts tip the learned relevance ordering,
                             mirroring how `:rrf` dominates today with boosts tipping it).
   - `:rerank_as_scorer`  -- final score = `existing total_score + weight*rerank` (keeps `:rrf`; double-counts
                             relevance -- kept for completeness).
   - `:rerank_fusion`     -- like `:rerank_then_boost`, but the reranked pool is selected rank-fusion-free
                             (best arm rank) rather than from the RRF-ordered `total_score` list.
  Mastered here so the OSS API param and the EE rerank step share one definition."
  [:rerank_only :rerank_then_boost :rerank_as_scorer :rerank_fusion])

(def RerankerConfig
  "Schema for the semantic-engine Voyage cross-encoder rerank config (the `reranker_config` API param, sent as
  a JSON object). After the SQL hybrid query, RRF/boost scoring, and the permission filter have produced the
  candidate list, the top-`:pool` candidates are reranked by the Voyage cross-encoder over their `content`
  (the `embeddable_text` block), then recombined per `:blend` (see [[rerank-blend-modes]]) and re-sorted. An
  absent param means no rerank, so absent-param = baseline.

  Rerank is a precision tool, not a recall tool: it only reorders candidates the SQL already returned, so it
  helps `retrieved-but-buried` targets and cannot surface a target absent from the pool. The global
  `ee-reranking-enabled` setting is an additional kill switch; this per-request config is the opt-in.

  Provider + API key live in backend settings ([[metabase-enterprise.semantic-search.settings]]), not here --
  this config carries only the per-request experiment knobs. `:pool` is the candidate count reranked (the
  cross-encoder cost driver); `:top-k` truncates the final list (keep it >= the min-results threshold, or run
  the eval with `disable_fallback`, so truncation never spuriously trips the appdb fallback); `:weight` is the
  rerank-score weight in the `:rerank_then_boost`/`:rerank_as_scorer`/`:rerank_fusion` blends (default mirrors
  the dominant `:rrf` static weight). Mastered here so the OSS API param and the EE query builder share one
  definition."
  [:map {:closed true}
   [:model  {:optional true} :string]                         ; default = ee-reranking-model setting
   [:pool   {:optional true} pos-int?]                        ; N candidates reranked (default 50)
   [:top-k  {:optional true} pos-int?]                        ; results kept after rerank (default = pool)
   [:weight {:optional true} [:double {:min 0.0}]]            ; rerank-score weight in D1/D2/D3 (default 500.0)
   [:blend  {:optional true} (into [:enum] rerank-blend-modes)]]) ; default :rerank_then_boost

(def ^:private ui-contexts
  "Search `context` values issued by the frontend, one per UI surface.
  Selects ranking weights ([[static-context-weights]]) and filter defaults ([[filter-defaults-by-context]]).
  Keep in sync with the frontend `SearchContext` type (frontend/src/metabase-types/api/search.ts).
  Give every value a comment naming the surface that issues it."
  [:search-bar          ; the global navbar search typeahead
   :search-app          ; the full-page search results app
   :command-palette     ; the ⌘K command palette
   :entity-picker       ; the entity-picker modal (cards, dashboards, collections, …)
   :data-picker         ; picking a data source (table/model/metric) while building a query
   :type-filter         ; the search type-filter dropdown's available-models lookup
   :basic-actions       ; the command palette's basic-actions "do any models exist?" gate (New action), not a user search
   :browse              ; the Browse models / Browse metrics pages
   :embedding-setup     ; embedding/SDK setup and preview resource selection
   :document            ; entity references embedded in documents
   :library             ; the data-studio Library page (EE)
   :dependencies        ; the dependency-graph entry search (EE)
   :model-migration])   ; the migrate-models admin page (EE)

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
   ;; Semantic-engine vector-search strategy (:hnsw or :brute-force). When absent, the engine uses its
   ;; configured default setting.
   [:vector-search-strategy {:optional true} [:maybe keyword?]]
   ;; Semantic-engine cosine-distance cut-off override. When absent, the engine uses its hardcoded default.
   [:max-cosine-distance {:optional true} [:maybe number?]]
   ;; Semantic-engine federated-retrieval partition config. When absent, the engine uses a single global KNN.
   [:partition-config   {:optional true} [:maybe PartitionConfig]]
   ;; Semantic-engine multi-view-embeddings config. When absent, the engine uses a single global KNN.
   [:multi-view-config  {:optional true} [:maybe MultiViewConfig]]
   ;; Semantic-engine composed federated + multi-view config. When absent, the engine uses a single global KNN.
   [:federated-multi-view-config {:optional true} [:maybe FederatedMultiViewConfig]]
   ;; Semantic-engine Voyage cross-encoder rerank config. When absent, no rerank step runs (baseline).
   [:reranker-config    {:optional true} [:maybe RerankerConfig]]
   [:search-string      {:optional true} [:maybe ms/NonBlankString]]
   [:weights            {:optional true} [:maybe [:map-of :keyword number?]]]
   ;; Semantic-engine: when true, disable the appdb fallback entirely -- return semantic results
   ;; unsupplemented below the min-results threshold, and re-throw (not fall back) on a vector-query error.
   [:disable-fallback?  {:optional true} [:maybe :boolean]]
   ;; Semantic-engine: when true, emit per-stage retrieval-attribution diagnostics (the top-level
   ;; `pipeline` block + per-row arm/view fields). Eval-only; absent/false => response is unchanged.
   [:debug-pipeline?    {:optional true} [:maybe :boolean]]
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
