(ns metabase-enterprise.content-diagnostics.api
  "Content Diagnostics API - paginated, batch-hydrated latest-per-entity finding lists, mounted behind
  `premium-handler … :content-diagnostics` (`+auth` + feature gate). Endpoints only: each composes the
  shared read/hydration layer in `impl` and pins its own param + response schema. The scan runs on a
  Quartz job; a demo/dev-only `POST /scan` also triggers it synchronously.

  Response shape: a flat identity (`id, finding_type, entity_type, entity_id, detected_at,
  entity_display_name`) plus a nested typed `details` merging the stored verdict with live-hydrated
  `collection`, `description`, `owner`, and `creator`."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.impl :as impl]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------- response schema ----------------------------------------

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
     [:owner          impl/NormalizedUser]
     [:creator        impl/Creator]
     [:threshold_days {:optional true} :int]]]])

(def ^:private stale-sort-column->field
  "Sortable stale-list params → their native `content_diagnostics_finding` column. The shared base plus
  the stale-specific `last-active-at` magnitude column."
  (assoc impl/base-sort-column->field :last-active-at :last_active_at))

(defn- stale-where-clause
  "WHERE for the stale list: the valid + permission-visible base, narrowed by the optional per-request
  filters. Each optional filter is precomputed so a nil (no-op) filter is skipped, not conjoined as a
  null AND-term."
  [{:keys [include-personal-collections entity-types threshold-days query]}]
  (let [personal-filter    (when-not include-personal-collections (impl/exclude-personal-collections-clause))
        entity-type-filter (when-let [types (not-empty (u/one-or-many entity-types))]
                             [:in :entity_type (mapv name types)])
        ;; "less stale than threshold-days" = active more recently than the cutoff → excluded. Never-used
        ;; (`last_active_at` nil) is maximally stale, so it always passes. Mirrors the scan-time cutoff.
        threshold-filter   (when threshold-days
                             (let [cutoff (t/minus (t/local-date) (t/days threshold-days))]
                               [:or [:= :last_active_at nil] [:<= :last_active_at cutoff]]))
        name-search-filter (impl/name-search-clause query)]
    (cond-> [:and (impl/valid-clause "stale") (impl/visible-findings-clause)]
      personal-filter    (conj personal-filter)
      entity-type-filter (conj entity-type-filter)
      threshold-filter   (conj threshold-filter)
      name-search-filter (conj name-search-filter))))

;;; ------------------------------------------------ endpoints ------------------------------------------

(api.macros/defendpoint :post "/scan"
  :- [:map
      [:scan_id       :string]
      [:finding_count :int]
      [:duration_ms   :int]]
  "Run a scan **synchronously** and return its topline. Demo/dev-only — the production trigger is the
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
       [:sort-direction {:optional true} (ms/enum-decode-keyword impl/sort-directions)]
       [:entity-types   {:optional true} [:or
                                          (ms/enum-decode-keyword impl/covered-entity-types)
                                          [:sequential (ms/enum-decode-keyword impl/covered-entity-types)]]]
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
    {:data         (impl/hydrate-findings page {:top-level-cols [:last_active_at]})
     :total        (t2/count :model/ContentDiagnosticsFinding {:where where})
     :limit        (request/limit)
     :offset       (request/offset)
     :last_scan_at (impl/last-scan-at)}))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the Content Diagnostics API."
  (api.macros/ns-handler *ns* +auth))
