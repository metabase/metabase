(ns metabase-enterprise.content-diagnostics.api
  "Content Diagnostics API - paginated, batch-hydrated latest-per-entity finding lists, mounted behind
  `premium-handler … :content-diagnostics` (`+auth` + feature gate). Endpoints only: each composes the
  shared read/hydration layer in `api.common` and pins its own param + response schema. The scan runs on a
  Quartz job; a demo/dev-only `POST /scan` also triggers it synchronously.

  Response shape: a flat identity (`id, finding_type, entity_type, entity_id, detected_at,
  entity_display_name`) plus a nested typed `details` merging the stored verdict with live-hydrated
  `collection`, `description`, `owner`, and `creator`."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.api.common :as api.common]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------- response schema ----------------------------------------
;;; The HTTP response contract. Distinct from a checker's internal finding map (kebab keys, pre-hydration)
;;; - these describe the hydrated snake_case shape `api.common/hydrate-findings` produces.

(def ^:private NormalizedUser
  "A finding's `owner`: a Metabase user `{id,name,email,type:user}`, or - for an external transform owner -
  `{email,type:external}`, or nil. Keys optional to admit both variants."
  [:maybe [:map
           [:id    {:optional true} [:maybe :int]]
           [:name  {:optional true} [:maybe :string]]
           [:email {:optional true} [:maybe :string]]
           [:type  :keyword]]])

(def ^:private Creator
  "A finding's `creator`: a Metabase user `{id,name,type:user}` (denormalized from
  `entity_creator_id`/`entity_creator_name`), or nil. No `email` (not denormalized); `type` is always `:user`."
  [:maybe [:map {:closed true}
           [:id   :int]
           [:name [:maybe :string]]
           [:type [:= :user]]]])

(def ^:private StaleFinding
  "Response item for a `stale` finding: flat identity + nested typed `details`."
  [:map
   [:id                  :int]
   [:finding_type        :keyword]
   [:entity_type         :keyword]
   [:entity_id           :int]
   [:detected_at         some?]
   [:entity_display_name [:maybe :string]]
   ;; frozen scan-time activity anchor; nil ⇒ never used/ran (top-level, SQL-filterable by threshold-days)
   [:last_active_at      [:maybe some?]]
   ;; entity's created_at, denormalized at scan time (immutable ⇒ equals live)
   [:created_at          [:maybe some?]]
   [:details
    [:map
     [:collection     [:maybe :map]]
     [:description    [:maybe :string]]
     [:owner          NormalizedUser]
     [:creator        Creator]
     [:threshold_days {:optional true} :int]]]])

(def ^:private SlowEntity
  "A hydrated culprit of a container roll-up: an embedded slow **card** of a dashboard/document finding.
  Always a card - a container embeds cards (a dashboard via its dashcards, a document via the cards embedded
  in its body) and is flagged slow when one of those cards' queries is slow; it never embeds a transform, and
  a slow transform is its own leaf finding, not a member of another entity. `{id, name, entity_type, card_type?}`."
  [:map
   [:id          :int]
   [:name        [:maybe :string]]
   [:entity_type :keyword]
   [:card_type   {:optional true} [:maybe :keyword]]])

(def ^:private SlowFinding
  "Response item for a `slow` finding: flat identity + a top-level `duration_ms` + nested typed `details`.
  One open map covering both variants: a **leaf** (card/transform) freezes `details.threshold_ms`; a
  **container** (dashboard/document) carries `details.slow_entities` (hydrated culprit cards). Every slow
  row stamps `duration_ms` (leaf mean / container's slowest culprit), so it is never null in this result."
  [:map
   [:id                  :int]
   [:finding_type        :keyword]
   [:entity_type         :keyword]
   [:entity_id           :int]
   [:detected_at         some?]
   [:entity_display_name [:maybe :string]]
   ;; entity's created_at, denormalized at scan time (immutable ⇒ equals live)
   [:created_at          [:maybe some?]]
   ;; measured magnitude (top-level, SQL-filterable/sortable); always present on slow findings
   [:duration_ms         :int]
   [:details
    [:map
     [:collection    [:maybe :map]]
     [:description   [:maybe :string]]
     [:owner         NormalizedUser]
     [:creator       Creator]
     [:threshold_ms  {:optional true} :int]
     [:slow_entities {:optional true} [:sequential SlowEntity]]]]])

(def ^:private stale-sort-column->field
  "Sortable stale-list params → their native `content_diagnostics_finding` column. The shared base plus
  the stale-specific `last-active-at` magnitude column."
  (assoc api.common/base-sort-column->field :last-active-at :last_active_at))

(def ^:private slow-sort-column->field
  "Sortable slow-list params → their native `content_diagnostics_finding` column. The shared base plus
  the slow-specific `duration-ms` magnitude column."
  (assoc api.common/base-sort-column->field :duration-ms :duration_ms))

(defn- stale-where-clause
  "WHERE for the stale list: the valid + permission-visible base, narrowed by the optional per-request
  filters. Each optional filter is precomputed so a nil (no-op) filter is skipped, not conjoined as a
  null AND-term."
  [{:keys [include-personal-collections entity-types threshold-days query]}]
  (let [personal-filter    (when-not include-personal-collections (api.common/exclude-personal-collections-clause))
        entity-type-filter (when-let [types (not-empty (u/one-or-many entity-types))]
                             [:in :entity_type (mapv name types)])
        ;; "less stale than threshold-days" = active more recently than the cutoff → excluded. Never-used
        ;; (`last_active_at` nil) is maximally stale, so it always passes. Mirrors the scan-time cutoff.
        threshold-filter   (when threshold-days
                             (let [cutoff (t/minus (t/local-date) (t/days threshold-days))]
                               [:or [:= :last_active_at nil] [:<= :last_active_at cutoff]]))
        name-search-filter (api.common/name-search-clause query)]
    (cond-> [:and (api.common/valid-clause "stale") (api.common/visible-findings-clause)]
      personal-filter    (conj personal-filter)
      entity-type-filter (conj entity-type-filter)
      threshold-filter   (conj threshold-filter)
      name-search-filter (conj name-search-filter))))

(defn- slow-where-clause
  "WHERE for the slow list: the valid + permission-visible base, narrowed by the optional per-request
  filters. `min-duration-ms` is a native `duration_ms` floor - containers filter naturally, since they
  stamp a representative duration. Same precompute-then-`cond->` shape as `stale-where-clause`."
  [{:keys [include-personal-collections entity-types min-duration-ms query]}]
  (let [personal-filter    (when-not include-personal-collections (api.common/exclude-personal-collections-clause))
        entity-type-filter (when-let [types (not-empty (u/one-or-many entity-types))]
                             [:in :entity_type (mapv name types)])
        duration-filter    (when min-duration-ms [:>= :duration_ms min-duration-ms])
        name-search-filter (api.common/name-search-clause query)]
    (cond-> [:and (api.common/valid-clause "slow") (api.common/visible-findings-clause)]
      personal-filter    (conj personal-filter)
      entity-type-filter (conj entity-type-filter)
      duration-filter    (conj duration-filter)
      name-search-filter (conj name-search-filter))))

;;; ------------------------------------------------ endpoints ------------------------------------------

(api.macros/defendpoint :post "/scan"
  :- [:map
      [:scan_id       :string]
      [:finding_count :int]
      [:duration_ms   :int]]
  "Run a scan **synchronously** and return its topline. Demo/dev-only - the production trigger is the
  scheduled Quartz job. Synchronous (calls `scan/scan!` directly, not `trigger-now!`) so it works with
  the scheduler disabled (`MB_DISABLE_SCHEDULER=true`)."
  []
  (scan/scan!))

(api.macros/defendpoint :get "/stale"
  :- [:map
      [:data         [:sequential StaleFinding]]
      [:total        :int]
      [:limit        [:maybe :int]]
      [:offset       [:maybe :int]]
      [:last_scan_at [:maybe some?]]]
  "List **stale** findings - the latest valid `stale` finding per entity, permission-filtered
  for the current user. Each item is a flat identity + a nested `details` (collection, `description`, `owner`,
  `creator`, `threshold_days`). Paginated via `limit`/`offset`; `total` is the full valid count.

  Params: `include-personal-collections` (default false) - when false, entities currently in a personal
  collection are excluded. `entity-types` (repeatable; `card`|`dashboard`|`document`|`transform`, omitted =
  all). `threshold-days` (positive int) keeps findings with `last_active_at` on or before `today -
  threshold-days` (never-used always pass). `query` case-insensitively substring-matches the entity name.
  `sort-column` (`detected-at`|`entity-type`|`name`|`created-at`|`created-by`|`last-active-at`, default
  `detected-at`) + `sort-direction` (`asc`|`desc`, default `asc`); `id` is the stable tiebreak."
  [_route-params
   {:keys [include-personal-collections sort-column sort-direction entity-types threshold-days query]
    :or   {include-personal-collections false
           sort-column                   :detected-at
           sort-direction                :asc}}
   :- [:map
       [:include-personal-collections {:optional true} :boolean]
       [:sort-column    {:optional true} (ms/enum-decode-keyword (keys stale-sort-column->field))]
       [:sort-direction {:optional true} (ms/enum-decode-keyword api.common/sort-directions)]
       [:entity-types   {:optional true} [:or
                                          (ms/enum-decode-keyword api.common/covered-entity-types)
                                          [:sequential (ms/enum-decode-keyword api.common/covered-entity-types)]]]
       [:threshold-days {:optional true} ms/PositiveInt]
       [:query          {:optional true} :string]]]
  (let [where (stale-where-clause {:include-personal-collections include-personal-collections
                                   :entity-types                 entity-types
                                   :threshold-days               threshold-days
                                   :query                        query})
        page  (t2/select :model/ContentDiagnosticsFinding
                         (cond-> {:where    where
                                  :order-by [[(stale-sort-column->field sort-column) sort-direction]
                                             [:id sort-direction]]}
                           (request/limit)  (assoc :limit (request/limit))
                           (request/offset) (assoc :offset (request/offset))))]
    {:data         (api.common/hydrate-findings page {:top-level-cols [:last_active_at]})
     :total        (t2/count :model/ContentDiagnosticsFinding {:where where})
     :limit        (request/limit)
     :offset       (request/offset)
     :last_scan_at (api.common/last-scan-at)}))

(api.macros/defendpoint :get "/slow"
  :- [:map
      [:data         [:sequential SlowFinding]]
      [:total        :int]
      [:limit        [:maybe :int]]
      [:offset       [:maybe :int]]
      [:last_scan_at [:maybe some?]]]
  "List **slow** findings - the latest valid `slow` finding per entity, permission-filtered for the
  current user. Each item is a flat identity + a top-level `duration_ms` + a nested `details`. `details`
  varies by `entity_type`: leaves (card/transform) freeze `threshold_ms`; containers (dashboard/document)
  carry the hydrated `slow_entities` culprit cards. Paginated via `limit`/`offset`; `total` is the full
  valid count.

  Params: `include-personal-collections` (default false) - when false, entities currently in a personal
  collection are excluded. `entity-types` (repeatable; `card`|`dashboard`|`document`|`transform`, omitted =
  all). `min-duration-ms` (positive int) keeps findings whose `duration_ms` is at least that (containers
  filter on their representative duration). `query` case-insensitively substring-matches the entity name.
  `sort-column` (`detected-at`|`entity-type`|`name`|`created-at`|`created-by`|`duration-ms`, default
  `detected-at`) + `sort-direction` (`asc`|`desc`, default `asc`); `id` is the stable tiebreak."
  [_route-params
   {:keys [include-personal-collections sort-column sort-direction entity-types min-duration-ms query]
    :or   {include-personal-collections false
           sort-column                   :detected-at
           sort-direction                :asc}}
   :- [:map
       [:include-personal-collections {:optional true} :boolean]
       [:sort-column     {:optional true} (ms/enum-decode-keyword (keys slow-sort-column->field))]
       [:sort-direction  {:optional true} (ms/enum-decode-keyword api.common/sort-directions)]
       [:entity-types    {:optional true} [:or
                                           (ms/enum-decode-keyword api.common/covered-entity-types)
                                           [:sequential (ms/enum-decode-keyword api.common/covered-entity-types)]]]
       [:min-duration-ms {:optional true} ms/PositiveInt]
       [:query           {:optional true} :string]]]
  (let [where (slow-where-clause {:include-personal-collections include-personal-collections
                                  :entity-types                 entity-types
                                  :min-duration-ms              min-duration-ms
                                  :query                        query})
        page  (t2/select :model/ContentDiagnosticsFinding
                         (cond-> {:where    where
                                  :order-by [[(slow-sort-column->field sort-column) sort-direction]
                                             [:id sort-direction]]}
                           (request/limit)  (assoc :limit (request/limit))
                           (request/offset) (assoc :offset (request/offset))))]
    {:data         (api.common/hydrate-findings page {:top-level-cols [:duration_ms] :hydrate-culprits? true})
     :total        (t2/count :model/ContentDiagnosticsFinding {:where where})
     :limit        (request/limit)
     :offset       (request/offset)
     :last_scan_at (api.common/last-scan-at)}))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the Content Diagnostics API."
  (api.macros/ns-handler *ns* +auth))
