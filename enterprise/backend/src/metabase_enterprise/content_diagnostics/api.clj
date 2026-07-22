(ns metabase-enterprise.content-diagnostics.api
  "Content Diagnostics API - paginated, batch-hydrated latest-per-entity finding lists, mounted behind
  `premium-handler … :content-diagnostics` (`+auth` + feature gate). Endpoints only: each composes the
  shared read/hydration layer in `api.common` and pins its own param + response schema. The scan runs on a
  Quartz job.

  Response shape: a flat identity (`id, finding_type, entity_type, entity_id, detected_at,
  entity_display_name`) plus a nested typed `details` merging the stored verdict with live-hydrated
  `collection`, `description`, `owner`, `creator`, and `view_count` (the entity's usage counter, present
  for card/dashboard/document; not collection or transform)."
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

(def ^:private ImbalancedFinding
  "Response item for the `/imbalanced` umbrella - the stored `empty`/`sparse`/`crowded` finding types
  share the count-vs-threshold schema, so one open map covers all three; the top-level `finding_type`
  discriminates. `content_count` is the measured magnitude (0 on every `empty`); `details.threshold` is
  the bound crossed (floor for sparse, ceiling for crowded, implicit 0 for empty) and `details.unit`
  what was counted (`items` collection / `dashcards`|`tabs` dashboard / `cards` document / `rows`
  card + transform). The two evidence-dated empties add `details.as_of`: card = the deciding run's
  start, transform = the row-count estimate's sync time. `details.view_count` is the entity's live
  usage counter, present for card/dashboard/document subjects (collection and transform have none)."
  [:map
   [:id                  :int]
   [:finding_type        :keyword]
   [:entity_type         :keyword]
   [:entity_id           :int]
   [:detected_at         some?]
   [:entity_display_name [:maybe :string]]
   ;; entity's created_at, denormalized at scan time (immutable ⇒ equals live)
   [:created_at          [:maybe some?]]
   ;; measured magnitude (top-level, SQL-filterable/sortable); always present on imbalanced findings
   [:content_count       :int]
   [:details
    [:map
     [:collection  [:maybe :map]]
     [:description [:maybe :string]]
     [:owner       NormalizedUser]
     [:creator     Creator]
     [:view_count  {:optional true} :int]
     [:threshold   :int]
     [:unit        :string]
     [:as_of       {:optional true} some?]]]])

(def ^:private stale-sort-column->field
  "Sortable stale-list params → their native `content_diagnostics_finding` column. The shared base plus
  the stale-specific `last-active-at` magnitude column."
  (assoc api.common/base-sort-column->field :last-active-at :last_active_at))

(def ^:private slow-sort-column->field
  "Sortable slow-list params → their native `content_diagnostics_finding` column. The shared base plus
  the slow-specific `duration-ms` magnitude column."
  (assoc api.common/base-sort-column->field :duration-ms :duration_ms))

(def ^:private imbalanced-sort-column->field
  "Sortable imbalanced-list params → their native `content_diagnostics_finding` column. The shared base
  plus the imbalanced-specific `content-count` magnitude column (never NULL within this endpoint -
  every imbalanced finding stamps it)."
  (assoc api.common/base-sort-column->field :content-count :content_count))

(def ^:private imbalanced-finding-types
  "The stored finding types the `/imbalanced` umbrella endpoint spans."
  #{:empty :sparse :crowded})

(def ^:private imbalanced-entity-types
  "Entity types the imbalanced finding types can emit - all five kinds. Deliberately this endpoint's own
  enum (not a widened `api.common/covered-entity-types`): `collection` is an imbalanced-only subject,
  and `card` participates in `empty` only (so `entity-types=card&finding-types=crowded` naturally
  yields an empty set)."
  #{:card :collection :dashboard :document :transform})

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

(defn- imbalanced-where-clause
  "The shared finding-list WHERE over the umbrella's finding types (narrowed by the `finding-types`
  param - the where-clause is the umbrella set intersected with the param) plus the `min-`/`max-content-count`
  floor/ceiling on the native `content_count` (crowded queries typically use min, empty/sparse max,
  but both apply to all)."
  [{:keys [finding-types min-content-count max-content-count] :as params}]
  (let [types (or (not-empty (u/one-or-many finding-types)) imbalanced-finding-types)]
    (api.common/findings-where
     (mapv name types) params
     (when min-content-count [:>= :content_count min-content-count])
     (when max-content-count [:<= :content_count max-content-count]))))

(defn- findings-response
  "The shared list-endpoint pipeline: select the sorted, paginated page for `where`, hydrate it
  (`excluded-personal-ids` gates the culprit hydration; the per-finding-type tail - hoisted columns and
  any details rewrite - is dispatched inside `api.common/hydrate-findings`), and wrap it in the
  `{:data :total :limit :offset :last_scan_at}` envelope every finding list returns."
  [where sort-column->field sort-column sort-direction excluded-personal-ids]
  (let [page (t2/select :model/ContentDiagnosticsFinding
                        (cond-> {:where    where
                                 :order-by [[(sort-column->field sort-column) sort-direction]
                                            [:id sort-direction]]}
                          (request/limit)  (assoc :limit (request/limit))
                          (request/offset) (assoc :offset (request/offset))))]
    {:data         (api.common/hydrate-findings page excluded-personal-ids)
     :total        (t2/count :model/ContentDiagnosticsFinding {:where where})
     :limit        (request/limit)
     :offset       (request/offset)
     :last_scan_at (api.common/last-scan-at)}))

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
  (let [excluded-personal-ids (api.common/excluded-personal-collection-ids include-personal-collections)]
    (findings-response (stale-where-clause {:excluded-personal-collection-ids excluded-personal-ids
                                            :entity-types                     entity-types
                                            :threshold-days                   threshold-days
                                            :query                            query})
                       stale-sort-column->field sort-column sort-direction
                       excluded-personal-ids)))

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
  (let [excluded-personal-ids (api.common/excluded-personal-collection-ids include-personal-collections)]
    (findings-response (slow-where-clause {:excluded-personal-collection-ids excluded-personal-ids
                                           :entity-types                     entity-types
                                           :min-duration-ms                  min-duration-ms
                                           :query                            query})
                       slow-sort-column->field sort-column sort-direction
                       excluded-personal-ids)))

(api.macros/defendpoint :get "/imbalanced"
  :- [:map
      [:data         [:sequential ImbalancedFinding]]
      [:total        :int]
      [:limit        [:maybe :int]]
      [:offset       [:maybe :int]]
      [:last_scan_at [:maybe some?]]]
  "List **imbalanced** findings - the latest valid finding per (entity, finding-type) across the
  `empty`/`sparse`/`crowded` umbrella, permission-filtered for the current user. The three types are
  detected by independent checkers with no cross-type precedence, so one entity can surface once per
  finding type (e.g. a collection whose many items are all empty is both `crowded` and `empty`);
  rows are findings, not entities, and `total` counts findings.
  Each item is a flat identity + a top-level `content_count` + a nested `details` (collection,
  `description`, `owner`, `creator`, `threshold`, `unit`, and - card/transform `empty` only - `as_of`).
  For a `collection` finding the breadcrumb is the **parent** collection (null at root), `creator` is
  always null (collections have none - under the `created-by` sort they land in the null group, and a
  personal collection's owner is not a creator proxy), and `owner` is the owning user when the
  collection is personal. Paginated via `limit`/`offset`; `total` is the full valid count.

  Params: `include-personal-collections` (default false) - when false, entities currently in (or, for a
  collection subject, being) a personal collection are excluded. `entity-types` (repeatable;
  `card`|`collection`|`dashboard`|`document`|`transform`, omitted = all; `card` emits `empty` only).
  `finding-types` (repeatable; `empty`|`sparse`|`crowded`, omitted = all three) narrows within the
  umbrella. `min-content-count`/`max-content-count` (int, 0 or more) floor/ceiling the native
  `content_count`. `query` case-insensitively substring-matches the entity name. `sort-column`
  (`detected-at`|`entity-type`|`name`|`created-at`|`created-by`|`content-count`, default `detected-at`)
  + `sort-direction` (`asc`|`desc`, default `asc`); `id` is the stable tiebreak."
  [_route-params
   {:keys [include-personal-collections sort-column sort-direction entity-types finding-types
           min-content-count max-content-count query]
    :or   {include-personal-collections false
           sort-column                   :detected-at
           sort-direction                :asc}}
   :- [:map
       [:include-personal-collections {:optional true} :boolean]
       [:sort-column       {:optional true} (ms/enum-decode-keyword (keys imbalanced-sort-column->field))]
       [:sort-direction    {:optional true} (ms/enum-decode-keyword api.common/sort-directions)]
       [:entity-types      {:optional true} [:or
                                             (ms/enum-decode-keyword imbalanced-entity-types)
                                             [:sequential (ms/enum-decode-keyword imbalanced-entity-types)]]]
       [:finding-types     {:optional true} [:or
                                             (ms/enum-decode-keyword imbalanced-finding-types)
                                             [:sequential (ms/enum-decode-keyword imbalanced-finding-types)]]]
       [:min-content-count {:optional true} ms/IntGreaterThanOrEqualToZero]
       [:max-content-count {:optional true} ms/IntGreaterThanOrEqualToZero]
       [:query             {:optional true} :string]]]
  (let [excluded-personal-ids (api.common/excluded-personal-collection-ids include-personal-collections)]
    (findings-response (imbalanced-where-clause {:excluded-personal-collection-ids excluded-personal-ids
                                                 :entity-types                     entity-types
                                                 :finding-types                    finding-types
                                                 :min-content-count                min-content-count
                                                 :max-content-count                max-content-count
                                                 :query                            query})
                       imbalanced-sort-column->field sort-column sort-direction
                       excluded-personal-ids)))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the Content Diagnostics API."
  (api.macros/ns-handler *ns* +auth))
