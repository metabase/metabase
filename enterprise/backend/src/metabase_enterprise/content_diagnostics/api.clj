(ns metabase-enterprise.content-diagnostics.api
  "Content Diagnostics API - paginated, batch-hydrated latest-per-entity finding lists, mounted behind
  `premium-handler … :content-diagnostics` (`+auth` + feature gate). Endpoints only: each composes the
  shared read/hydration layer in `api.common` and pins its own param + response schema. The scan runs on a
  Quartz job.

  Response shape: a flat identity (`id, finding_type, entity_type, entity_id, detected_at,
  entity_display_name`) plus a nested typed `details` merging the stored verdict with live-hydrated
  `collection`, `description`, `owner`, `creator`, and `view_count` (the entity's usage counter, present
  for every type but transform)."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.api.common :as api.common]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.request.core :as request]
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
     [:view_count     {:optional true} :int]
     [:threshold_days {:optional true} :int]]]])

(def ^:private SlowEntity
  "A hydrated culprit of a container roll-up: an embedded slow **card** of a dashboard/document finding.
  Always a card - a container embeds cards (a dashboard via its dashcards, a document via the cards embedded
  in its body) and is flagged slow when one of those cards' queries is slow; it never embeds a transform, and
  a slow transform is its own leaf finding, not a member of another entity.
  `{id, name, entity_type, card_type?, view_count}`."
  [:map
   [:id          :int]
   [:name        [:maybe :string]]
   [:entity_type :keyword]
   [:card_type   {:optional true} [:maybe :keyword]]
   [:view_count  :int]])

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
     [:view_count    {:optional true} :int]
     [:threshold_ms  {:optional true} :int]
     [:slow_entities {:optional true} [:sequential SlowEntity]]]]])

(def ^:private DuplicatedEntity
  "A hydrated peer of a `duplicated` finding: another entity **of the same type** sharing the flagged
  entity's normalized name. `{id, name, entity_type, card_type?}` - `card_type` (question/model/metric)
  only on card peers."
  [:map
   [:id          :int]
   [:name        [:maybe :string]]
   [:entity_type :keyword]
   [:card_type   {:optional true} [:maybe :keyword]]])

(def ^:private DuplicatedFinding
  "Response item for a `duplicated` finding: flat identity + a top-level `duplicate_count` + nested typed
  `details`. `duplicate_count` is the peer count (cluster size minus 1) and is never null on duplicated
  findings. `details.matched_name` is the normalized name the cluster collided on;
  `details.duplicate_entities` are the hydrated peers the caller can see - permission and
  personal-collection filtering can leave it shorter than `duplicate_count`."
  [:map
   [:id                  :int]
   [:finding_type        :keyword]
   [:entity_type         :keyword]
   [:entity_id           :int]
   [:detected_at         some?]
   [:entity_display_name [:maybe :string]]
   ;; entity's created_at, denormalized at scan time (immutable ⇒ equals live)
   [:created_at          [:maybe some?]]
   ;; peer count (top-level, SQL-filterable/sortable); always present on duplicated findings
   [:duplicate_count     :int]
   [:details
    [:map
     [:collection         [:maybe :map]]
     [:description        [:maybe :string]]
     [:owner              NormalizedUser]
     [:creator            Creator]
     [:matched_name       {:optional true} :string]
     [:duplicate_entities {:optional true} [:sequential DuplicatedEntity]]]]])

(def ^:private stale-sort-column->field
  "Sortable stale-list params → their native `content_diagnostics_finding` column. The shared base plus
  the stale-specific `last-active-at` magnitude column."
  (assoc api.common/base-sort-column->field :last-active-at :last_active_at))

(def ^:private slow-sort-column->field
  "Sortable slow-list params → their native `content_diagnostics_finding` column. The shared base plus
  the slow-specific `duration-ms` magnitude column."
  (assoc api.common/base-sort-column->field :duration-ms :duration_ms))

(def ^:private duplicated-sort-column->field
  "Sortable duplicated-list params → their native `content_diagnostics_finding` column. The shared base
  plus the duplicated-specific `duplicate-count` magnitude column."
  (assoc api.common/base-sort-column->field :duplicate-count :duplicate_count))

(defn- stale-where-clause
  "The shared finding-list WHERE plus the stale-specific `threshold-days` filter - keeps findings whose
  `last_active_at` is on or before `today - threshold-days` (never-used always pass)."
  [{:keys [threshold-days] :as params}]
  (api.common/findings-where
   "stale" params
   ;; "less stale than threshold-days" = active more recently than the cutoff → excluded. Never-used
   ;; (`last_active_at` nil) is maximally stale, so it always passes. Mirrors the scan-time cutoff.
   (when threshold-days
     (let [cutoff (t/minus (t/local-date) (t/days threshold-days))]
       [:or [:= :last_active_at nil] [:<= :last_active_at cutoff]]))))

(defn- slow-where-clause
  "The shared finding-list WHERE plus the slow-specific `min-duration-ms` floor on the native `duration_ms`
  (containers filter naturally, since they stamp a representative duration)."
  [{:keys [min-duration-ms] :as params}]
  (api.common/findings-where
   "slow" params
   (when min-duration-ms [:>= :duration_ms min-duration-ms])))

(defn- duplicated-where-clause
  "The shared finding-list WHERE plus the duplicated-specific `min-duplicate-count` floor on the native
  `duplicate_count` (the peer count - e.g. names shared by 3+ entities = `min-duplicate-count` 2)."
  [{:keys [min-duplicate-count] :as params}]
  (api.common/findings-where
   "duplicated" params
   (when min-duplicate-count [:>= :duplicate_count min-duplicate-count])))

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
  (let [excluded-personal-ids (api.common/excluded-personal-collection-ids include-personal-collections)
        where (stale-where-clause {:excluded-personal-collection-ids excluded-personal-ids
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
  collection are excluded and personal-collection culprit cards are omitted from `slow_entities`.
  `entity-types` (repeatable; `card`|`dashboard`|`document`|`transform`, omitted =
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
  (let [excluded-personal-ids (api.common/excluded-personal-collection-ids include-personal-collections)
        where (slow-where-clause {:excluded-personal-collection-ids excluded-personal-ids
                                  :entity-types                 entity-types
                                  :min-duration-ms              min-duration-ms
                                  :query                        query})
        page  (t2/select :model/ContentDiagnosticsFinding
                         (cond-> {:where    where
                                  :order-by [[(slow-sort-column->field sort-column) sort-direction]
                                             [:id sort-direction]]}
                           (request/limit)  (assoc :limit (request/limit))
                           (request/offset) (assoc :offset (request/offset))))]
    {:data         (api.common/hydrate-findings page {:top-level-cols                   [:duration_ms]
                                                      :hydrate-culprits?                true
                                                      :excluded-personal-collection-ids excluded-personal-ids})
     :total        (t2/count :model/ContentDiagnosticsFinding {:where where})
     :limit        (request/limit)
     :offset       (request/offset)
     :last_scan_at (api.common/last-scan-at)}))

(api.macros/defendpoint :get "/duplicated"
  :- [:map
      [:data         [:sequential DuplicatedFinding]]
      [:total        :int]
      [:limit        [:maybe :int]]
      [:offset       [:maybe :int]]
      [:last_scan_at [:maybe some?]]]
  "List **duplicated** findings - the latest valid `duplicated` finding per entity, permission-filtered
  for the current user. Each item is a flat identity + a top-level `duplicate_count` (the number of other
  same-type entities sharing the normalized name) + a nested `details` (collection, `description`,
  `owner`, `creator`, `matched_name`, and the hydrated same-type `duplicate_entities` peers). Paginated
  via `limit`/`offset`; `total` is the full valid count.

  Params: `include-personal-collections` (default false) - when false, entities currently in a personal
  collection are excluded and personal-collection peers are omitted from `duplicate_entities`.
  `entity-types` (repeatable; `card`|`dashboard`|`document`|`transform`, omitted = all).
  `min-duplicate-count` (positive int) keeps findings with at least that many peers. `query`
  case-insensitively substring-matches the entity name. `sort-column`
  (`detected-at`|`entity-type`|`name`|`created-at`|`created-by`|`duplicate-count`, default `detected-at`)
  + `sort-direction` (`asc`|`desc`, default `asc`); `id` is the stable tiebreak."
  [_route-params
   {:keys [include-personal-collections sort-column sort-direction entity-types min-duplicate-count query]
    :or   {include-personal-collections false
           sort-column                   :detected-at
           sort-direction                :asc}}
   :- [:map
       [:include-personal-collections {:optional true} :boolean]
       [:sort-column         {:optional true} (ms/enum-decode-keyword (keys duplicated-sort-column->field))]
       [:sort-direction      {:optional true} (ms/enum-decode-keyword api.common/sort-directions)]
       [:entity-types        {:optional true} [:or
                                               (ms/enum-decode-keyword api.common/covered-entity-types)
                                               [:sequential (ms/enum-decode-keyword api.common/covered-entity-types)]]]
       [:min-duplicate-count {:optional true} ms/PositiveInt]
       [:query               {:optional true} :string]]]
  (let [excluded-personal-ids (api.common/excluded-personal-collection-ids include-personal-collections)
        where (duplicated-where-clause {:excluded-personal-collection-ids excluded-personal-ids
                                        :entity-types                 entity-types
                                        :min-duplicate-count          min-duplicate-count
                                        :query                        query})
        page  (t2/select :model/ContentDiagnosticsFinding
                         (cond-> {:where    where
                                  :order-by [[(duplicated-sort-column->field sort-column) sort-direction]
                                             [:id sort-direction]]}
                           (request/limit)  (assoc :limit (request/limit))
                           (request/offset) (assoc :offset (request/offset))))]
    {:data         (api.common/hydrate-findings page {:top-level-cols                   [:duplicate_count]
                                                      :hydrate-duplicate-peers?         true
                                                      :excluded-personal-collection-ids excluded-personal-ids})
     :total        (t2/count :model/ContentDiagnosticsFinding {:where where})
     :limit        (request/limit)
     :offset       (request/offset)
     :last_scan_at (api.common/last-scan-at)}))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the Content Diagnostics API."
  (api.macros/ns-handler *ns* +auth))
