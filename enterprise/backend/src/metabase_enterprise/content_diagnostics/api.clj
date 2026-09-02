(ns metabase-enterprise.content-diagnostics.api
  "Content Diagnostics API - paginated, batch-hydrated latest-per-entity finding lists, mounted behind
  `premium-handler … :content-diagnostics` (`+auth` + feature gate). The namespace is audience-gated to
  superuser/data-analyst/`:monitoring` ([[+check-diagnostics-access]]). Endpoints only: each composes the
  shared read/hydration layer in `api.common` and pins its own param + response schema. The scan runs on a
  Quartz job.

  Response shape: a flat identity (`id, finding_type, entity_type, entity_kind, card_type?, entity_id,
  detected_at, entity_display_name, collection_name`) plus a nested typed `details` merging the stored
  verdict with live-hydrated `collection`, `description`, `owner`, `creator`, and `view_count` (the
  entity's usage counter, present for card/dashboard/document; not collection or transform)."
  (:require
   [clout.core :as clout]
   [java-time.api :as t]
   [malli.core :as mc]
   [metabase-enterprise.content-diagnostics.api.common :as api.common]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common :refer [+auth]]
   [metabase.permissions.core :as perms]
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

(def ^:private FindingBase
  "The flat identity every finding response shares. Each finding `:merge`s its own top-level column
  (`last_active_at` / `duration_ms` / `duplicate_count` / `content_count`) and its typed `details` onto
  this."
  [:map
   [:id                  :int]
   [:finding_type        :keyword]
   [:entity_type         :keyword]
   ;; card findings only - report_card.type denormalized at scan time; the column `entity-types` filters
   ;; on when given a card sub-kind (question/model/metric);
   ;; nullable (rows can predate the column, and a card deleted mid-scan stamps nil)
   [:card_type           {:optional true} [:maybe :keyword]]
   [:entity_kind         :keyword]
   [:entity_id           :int]
   [:detected_at         ms/TemporalInstant]
   [:entity_display_name [:maybe :string]]
   ;; entity's created_at, denormalized at scan time (immutable ⇒ equals live)
   [:created_at          [:maybe ms/TemporalInstant]]
   ;; whether the caller can trash the entity (curate its collection, or delete a transform)
   [:can_write           :boolean]
   ;; scan-time parent-collection name (the collection sort key); root rows carry the site-locale root
   ;; label. nil when the caller cannot read the scan-time parent or the row predates the migration.
   ;; details.collection stays the live, permission-scoped breadcrumb for navigation.
   [:collection_name     [:maybe :string]]])

(def ^:private BreadcrumbId
  "A breadcrumb collection id: a real collection id, or the literal \"root\" of the root sentinel."
  [:or :int [:= "root"]])

(def ^:private BreadcrumbName
  "A breadcrumb collection name. Admits a localized string because validation runs on the raw response,
  where a root sentinel's label is still a `tru` instance."
  [:or :string ms/LocalizedString])

(def ^:private CollectionBreadcrumb
  "A finding's `collection`: the entity's parent-collection breadcrumb, or nil (unreadable parent /
  entity deleted post-scan). `namespace` is the collection tree's namespace - nil for the default tree;
  `transforms` and `shared-tenant-collection` are the namespaced trees findings can live in."
  [:maybe [:map {:closed true}
           [:id                  BreadcrumbId]
           [:name                BreadcrumbName]
           [:namespace           [:maybe :keyword]]
           [:effective_ancestors [:sequential
                                  [:map {:closed true}
                                   [:id   BreadcrumbId]
                                   [:name BreadcrumbName]]]]]])

(def ^:private FindingDetailsBase
  "The display fields every finding's `details` carries: the collection breadcrumb, live `description`, the
  hydrated `owner`/`creator`, and the entity's `view_count` (present for every type but transform). Each
  finding type `:merge`s its own detail extras onto this."
  [:map
   [:collection  CollectionBreadcrumb]
   [:description [:maybe :string]]
   [:owner       NormalizedUser]
   [:creator     Creator]
   [:view_count  {:optional true} :int]])

(def ^:private StaleDetails
  "`stale` details: the shared core plus the frozen `threshold_days` verdict."
  [:merge FindingDetailsBase
   [:map
    [:threshold_days {:optional true} :int]]])

(def ^:private StaleFinding
  "Response item for a `stale` finding: flat identity + a top-level `last_active_at` + nested typed `details`."
  [:merge FindingBase
   [:map
    ;; frozen scan-time activity anchor; nil ⇒ never used/ran (top-level, SQL-filterable by threshold-days)
    [:last_active_at [:maybe ms/TemporalInstant]]
    [:details        StaleDetails]]])

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

(def ^:private SlowDetails
  "`slow` details: the shared core plus a leaf's frozen `threshold_ms`, or a container's hydrated
  `slow_entities` culprit cards."
  [:merge FindingDetailsBase
   [:map
    [:threshold_ms  {:optional true} :int]
    [:slow_entities {:optional true} [:sequential SlowEntity]]]])

(def ^:private SlowFinding
  "Response item for a `slow` finding: flat identity + a top-level `duration_ms` + nested typed `details`.
  One open map covering both variants: a **leaf** (card/transform) freezes `details.threshold_ms`; a
  **container** (dashboard/document) carries `details.slow_entities` (hydrated culprit cards). Every slow
  row stamps `duration_ms` (leaf mean / container's slowest culprit), so it is never null in this result."
  [:merge FindingBase
   [:map
    ;; measured magnitude (top-level, SQL-filterable/sortable); always present on slow findings
    [:duration_ms :int]
    [:details     SlowDetails]]])

(def ^:private DuplicatedEntity
  "A hydrated peer of a `duplicated` finding: another entity **of the same type** sharing the flagged
  entity's normalized name. `{id, name, entity_type, card_type?, view_count?}` - `card_type`
  (question/model/metric) only on card peers. Card/dashboard/document peers carry their live
  `view_count` for judging which duplicate is the abandoned one; transforms have no view concept, so
  transform peers carry no usage signal."
  [:map
   [:id          :int]
   [:name        [:maybe :string]]
   [:entity_type :keyword]
   [:card_type   {:optional true} [:maybe :keyword]]
   [:view_count  {:optional true} :int]])

(def ^:private DuplicatedDetails
  "`duplicated` details: the shared core plus the collided `normalized_name` and the hydrated same-type
  `duplicate_entities` peers."
  [:merge FindingDetailsBase
   [:map
    [:normalized_name    :string]
    [:duplicate_entities [:sequential DuplicatedEntity]]]])

(def ^:private DuplicatedFinding
  "Response item for a `duplicated` finding: flat identity + a top-level `duplicate_count` + nested typed
  `details`. `duplicate_count` is the peer count (cluster size minus 1) and is never null on duplicated
  findings. `details.view_count` is the flagged entity's own live usage counter (present for every type
  but transform). `details.normalized_name` is the normalized name the cluster collided on;
  `details.duplicate_entities` are the hydrated peers the caller can see - permission and
  personal-collection filtering can leave it shorter than `duplicate_count` (down to empty, but the key
  is always present)."
  [:merge FindingBase
   [:map
    ;; peer count (top-level, SQL-filterable/sortable); always present on duplicated findings
    [:duplicate_count :int]
    [:details         DuplicatedDetails]]])

(def ^:private ImbalancedDetails
  "`imbalanced` details. `as_of` lives in the JSON `details` blob, so it round-trips as a string, not a
  temporal instant."
  [:merge FindingDetailsBase
   [:map
    [:threshold :int]
    [:unit      :string]
    [:as_of     {:optional true} ms/TemporalString]]])

(def ^:private ImbalancedFinding
  "Response item for the `/imbalanced` endpoint. `empty`/`sparse`/`crowded` share one count-vs-threshold
  shape, discriminated by the top-level `finding_type`: `content_count` is the measured amount (0 for
  `empty`), `details.threshold` the bound it crossed, `details.unit` what was counted."
  [:merge FindingBase
   [:map
    ;; measured magnitude (top-level, SQL-filterable/sortable); always present on imbalanced findings
    [:content_count :int]
    [:details       ImbalancedDetails]]])

(def ^:private stale-sort-column->field
  "Sortable stale-list params → their native `content_diagnostics_finding` column. The shared base plus
  the stale-specific `last-active-at` magnitude column."
  (assoc api.common/base-sort-column->field :last-active-at :last_active_at))

(def ^:private slow-sort-column->field
  "Sortable slow-list params → their native `content_diagnostics_finding` column. The shared base plus
  the slow-specific `duration-ms` magnitude column."
  (assoc api.common/base-sort-column->field :duration-ms :duration_ms))

(def ^:private imbalanced-sort-column->field
  "Sortable imbalanced-list params → their native `content_diagnostics_finding` column: the shared base
  plus `content-count` (always set on an imbalanced finding) and `finding-type`."
  (assoc api.common/base-sort-column->field
         :content-count :content_count
         :finding-type  :finding_type))

(def ^:private imbalanced-finding-types
  "The finding types the `/imbalanced` endpoint spans."
  #{:empty :sparse :crowded})

(def ^:private imbalanced-entity-types
  "Entity types the imbalanced findings can emit. Its own enum rather than the shared
  `covered-entity-types`: `collection` sits outside the shared stale/slow set, and `card` only ever
  emits `empty`."
  #{:card :collection :dashboard :document :transform})

(def ^:private duplicated-sort-column->field
  "Sortable duplicated-list params → their native `content_diagnostics_finding` column. The shared base
  plus the duplicated-specific `duplicate-count` magnitude column."
  (assoc api.common/base-sort-column->field :duplicate-count :duplicate_count))

(def ^:private duplicated-entity-types
  "Entity types the `duplicated` finding can emit - the shared `api.common/covered-entity-types` plus
  `:collection` (its own endpoint enum, not the shared set, so the stale/slow endpoints stay
  collection-free)."
  (conj api.common/covered-entity-types :collection))

(defn- entity-types-param
  "Param schema for `entity-types` - the flat vocabulary `api.common/filter-types` builds from the
  endpoint's `entity-types`."
  [entity-types]
  (let [enum (ms/enum-decode-keyword (api.common/filter-types entity-types))]
    [:or enum [:sequential enum]]))

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
  "The shared finding-list WHERE over the `empty`/`sparse`/`crowded` finding types, narrowed to the
  `finding-types` param when it is given."
  [{:keys [finding-types] :as params}]
  (let [types (or (not-empty (u/one-or-many finding-types)) imbalanced-finding-types)]
    (api.common/findings-where (mapv name types) params)))

(defn- duplicated-where-clause
  "The shared finding-list WHERE plus the duplicated-specific `min-duplicate-count` floor on the native
  `duplicate_count` (the peer count - e.g. names shared by 3+ entities = `min-duplicate-count` 2)."
  [{:keys [min-duplicate-count] :as params}]
  (api.common/findings-where
   "duplicated" params
   (when min-duplicate-count [:>= :duplicate_count min-duplicate-count])))

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

(defn- check-diagnostics-access
  "403 unless the caller is a superuser, a data analyst, or holds `:monitoring` - the same union as the
  FE `canAccessContentDiagnostics` guard. This only gates who can call the endpoints;
  `api.common/visible-findings-clause` still decides which findings they get back."
  []
  (api/check-403 (or (api/is-data-analyst?)
                     (perms/current-user-has-application-permissions? :monitoring))))

(def ^:private ^{:arglists '([handler])} +check-diagnostics-access
  "Applies [[check-diagnostics-access]] to every endpoint in the namespace, so a new one is gated
  automatically."
  (routes.common/wrap-middleware-for-open-api-spec-generation
   (fn [handler]
     (fn [request respond raise]
       (check-diagnostics-access)
       (handler request respond raise)))))

(defn- declared-param-names
  "The top-level keys `schema` declares, as strings. A nil schema -- the endpoint binds no params of that
  kind -- yields `#{}`, so every param of that kind counts as undeclared."
  [schema]
  (into #{} (map name) (some-> schema mc/explicit-keys)))

(def ^:private endpoint-param-specs
  "Per endpoint in this namespace: its method, its compiled Clout route, and the query and body param names
  it declares. A `delay` because `ns-routes` reads namespace metadata that each `defendpoint` appends to as
  it expands, and this `def` is evaluated before those forms. `*ns*` has to be captured out here: inside
  the `delay` it would resolve at deref time, to whichever namespace the request happens to be served
  from."
  (let [nmspace *ns*]
    (delay
      (mapv (fn [info]
              {:method (get-in info [:form :method])
               ;; the same two values `api.macros/ns-handler-map` compiles its own routes from
               :route  (clout/route-compile (get-in info [:form :route :path])
                                            (get-in info [:form :route :regexes] {}))
               :query  (declared-param-names (get-in info [:form :params :query :schema]))
               :body   (declared-param-names (get-in info [:form :params :body :schema]))})
            (vals (api.macros/ns-routes nmspace))))))

(defn- matching-endpoint
  "The spec of the endpoint that will handle `request`, or nil when none matches. Mirrors
  `api.macros/find-matching-handler` step for step, on the same request map that function will later see:
  the same `:request-method` filter, the same `:compojure/path` to `:path-info` assoc, the same
  `clout/route-matches`. Agreement with the real router is structural, not coincidental.

  `:compojure/path` is in fact nil for these routes; Clout matches on the `:path-info` (`/stale`) that
  compojure's `context` has already set, which it prefers over `:uri`. The assoc is kept anyway because
  the router does it."
  [request]
  (let [path    (:compojure/path request)
        request (cond-> request path (assoc :path-info path))]
    (some (fn [{:keys [method route] :as spec}]
            (when (and (= method (:request-method request))
                       (clout/route-matches route request))
              spec))
          @endpoint-param-specs)))

(defn- body-param-keys
  "The top-level keys of `request`'s body param map, or nil when it carries none. Replicates the private
  `api.macros/request-body` -- form params, else the parsed JSON body -- and so can drift from it.

  `:multipart-params` is deliberately not covered: multipart middleware is attached per endpoint by
  `api.macros/middleware-forms` and runs inside the endpoint handler, after this middleware, so the parts
  are not visible yet. A non-map body (an unparsed `InputStream`, a JSON array, a scalar) is not a param
  map and is left alone."
  [request]
  (let [body (or (not-empty (:form-params request))
                 (:body request))]
    (when (map? body)
      (keys body))))

(defn- undeclared-params
  "`{param-key message}` for each key of `ks` that `declared` does not contain. `ks` is strings for query
  params and keywords for body params, so keys are compared by `name`."
  [declared ks message]
  (into {}
        (comp (remove #(contains? declared (name %)))
              (map (fn [k] [(keyword k) message])))
        ks))

(def ^:private ^{:arglists '([handler])} +reject-undeclared-params
  "400s a request carrying a query or body param the endpoint it routes to does not declare. `defendpoint`
  decodes before it validates and its decode transformer ends in `strip-extra-keys-transformer`, so an
  undeclared key is deleted before any schema sees it -- `?sort-colum=asc` would otherwise answer 200 with
  unsorted results, indistinguishable from a filter that matched nothing.

  A request no endpoint matches passes straight through: the router is about to 404 it, and there are no
  declared params to judge it against. An endpoint that declares no schema for a kind of param rejects
  every param of that kind, since its allowlist is empty.

  Only top-level body keys are checked, symmetrically with the query side. Going deeper would mean
  reimplementing the decode-then-explain pipeline: explaining a body against a closed schema before
  decoding falsely rejects keys that the `:normalize` decode step would have renamed onto declared ones.

  `limit`/`offset` are deliberately not in any allowlist. `handle-paging` removes them from `:query-params`
  only when at least one parses as a long, so a well-formed `?limit=5` never reaches here, while a
  malformed `?limit=abc` does and 400s instead of quietly serving an unpaged list."
  (routes.common/wrap-middleware-for-open-api-spec-generation
   (fn [handler]
     (fn [request respond raise]
       (when-let [{:keys [query body]} (matching-endpoint request)]
         (let [errors (merge (undeclared-params query (keys (:query-params request))
                                                "unexpected query parameter")
                             (undeclared-params body (body-param-keys request)
                                                "unexpected body parameter"))]
           (when (seq errors)
             (throw (ex-info "Invalid parameters" {:status-code 400, :errors errors})))))
       (handler request respond raise)))))

(api.macros/defendpoint :get "/stale"
  :- [:map
      [:data         [:sequential StaleFinding]]
      [:total        :int]
      [:limit        [:maybe :int]]
      [:offset       [:maybe :int]]
      [:last_scan_at [:maybe ms/TemporalInstant]]]
  "List **stale** findings - the latest valid `stale` finding per entity, permission-filtered
  for the current user. Each item is a flat identity + a nested `details` (collection, `description`, `owner`,
  `creator`, `threshold_days`). Card items also carry a top-level `card_type`
  (`question`|`model`|`metric`) - card findings only, denormalized at scan time. Paginated via
  `limit`/`offset`; `total` is the full valid count.

  Params: `include-personal-collections` (default false) - when false, entities currently in a personal
  collection are excluded. `entity-types` (repeatable, omitted = all) narrows by type; the card sub-kinds
  are valid values, and `card` means any card type.
  `threshold-days` (positive int) keeps findings with `last_active_at` on or before `today -
  threshold-days` (never-used always pass). `query` case-insensitively substring-matches the entity name.
  `sort-column` (`detected-at`|`entity-type`|`name`|`created-at`|`created-by`|`collection-name`|
  `last-active-at`, default `detected-at`) + `sort-direction` (`asc`|`desc`, default `asc`); `id` is
  the stable tiebreak."
  [_route-params
   {:keys [include-personal-collections sort-column sort-direction entity-types threshold-days query]
    :or   {include-personal-collections false
           sort-column                   :detected-at
           sort-direction                :asc}}
   :- [:map
       [:include-personal-collections {:optional true} :boolean]
       [:sort-column    {:optional true} (ms/enum-decode-keyword (keys stale-sort-column->field))]
       [:sort-direction {:optional true} (ms/enum-decode-keyword api.common/sort-directions)]
       [:entity-types   {:optional true} (entity-types-param api.common/covered-entity-types)]
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
      [:last_scan_at [:maybe ms/TemporalInstant]]]
  "List **slow** findings - the latest valid `slow` finding per entity, permission-filtered for the
  current user. Each item is a flat identity + a top-level `duration_ms` + a nested `details`. `details`
  varies by `entity_type`: leaves (card/transform) freeze `threshold_ms`; containers (dashboard/document)
  carry the hydrated `slow_entities` culprit cards. Card items also carry a top-level `card_type`
  (`question`|`model`|`metric`) - card findings only, denormalized at scan time. Paginated via
  `limit`/`offset`; `total` is the full valid count.

  Params: `include-personal-collections` (default false) - when false, entities currently in a personal
  collection are excluded and personal-collection culprit cards are omitted from `slow_entities`.
  `entity-types` (repeatable, omitted = all) narrows the flagged entity by type; the card sub-kinds are
  valid values, and `card` means any card type. Containers rolled up from slow cards are matched on
  their own type.
  `min-duration-ms` (positive int) keeps findings whose `duration_ms` is at least that (containers
  filter on their representative duration). `query` case-insensitively substring-matches the entity name.
  `sort-column` (`detected-at`|`entity-type`|`name`|`created-at`|`created-by`|`collection-name`|
  `duration-ms`, default `detected-at`) + `sort-direction` (`asc`|`desc`, default `asc`); `id` is the
  stable tiebreak."
  [_route-params
   {:keys [include-personal-collections sort-column sort-direction entity-types min-duration-ms query]
    :or   {include-personal-collections false
           sort-column                   :detected-at
           sort-direction                :asc}}
   :- [:map
       [:include-personal-collections {:optional true} :boolean]
       [:sort-column     {:optional true} (ms/enum-decode-keyword (keys slow-sort-column->field))]
       [:sort-direction  {:optional true} (ms/enum-decode-keyword api.common/sort-directions)]
       [:entity-types    {:optional true} (entity-types-param api.common/covered-entity-types)]
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
      [:last_scan_at [:maybe ms/TemporalInstant]]]
  "List **imbalanced** findings - the latest valid finding per (entity, finding-type) across the
  `empty`/`sparse`/`crowded` checkers, permission-filtered for the current user. The checkers run
  independently, so one entity can appear once per finding type (a collection whose items are all empty
  is both `crowded` and `empty`) - rows are findings, not entities, and `total` counts findings. Each
  item is a flat identity plus a top-level `content_count` and a nested `details` (collection breadcrumb,
  description, owner, creator, the `threshold` crossed, and its `unit`). Card items (card only ever emits
  `empty`) also carry a top-level `card_type`, denormalized at scan time. Paginated via `limit`/`offset`.

  Params: `include-personal-collections` (default false) excludes entities in personal collections.
  `entity-types` and `finding-types` (both repeatable) narrow the results; the card sub-kinds are valid
  `entity-types` values, and `card` means any card type. `query` substring-matches the entity name.
  `sort-column` (default `detected-at`) + `sort-direction` (default `asc`); `id` breaks ties."
  [_route-params
   {:keys [include-personal-collections sort-column sort-direction entity-types finding-types query]
    :or   {include-personal-collections false
           sort-column                   :detected-at
           sort-direction                :asc}}
   :- [:map
       [:include-personal-collections {:optional true} :boolean]
       [:sort-column       {:optional true} (ms/enum-decode-keyword (keys imbalanced-sort-column->field))]
       [:sort-direction    {:optional true} (ms/enum-decode-keyword api.common/sort-directions)]
       [:entity-types      {:optional true} (entity-types-param imbalanced-entity-types)]
       [:finding-types     {:optional true} [:or
                                             (ms/enum-decode-keyword imbalanced-finding-types)
                                             [:sequential (ms/enum-decode-keyword imbalanced-finding-types)]]]
       [:query             {:optional true} :string]]]
  (let [excluded-personal-ids (api.common/excluded-personal-collection-ids include-personal-collections)]
    (findings-response (imbalanced-where-clause {:excluded-personal-collection-ids excluded-personal-ids
                                                 :entity-types                     entity-types
                                                 :finding-types                    finding-types
                                                 :query                            query})
                       imbalanced-sort-column->field sort-column sort-direction
                       excluded-personal-ids)))
(api.macros/defendpoint :get "/duplicated"
  :- [:map
      [:data         [:sequential DuplicatedFinding]]
      [:total        :int]
      [:limit        [:maybe :int]]
      [:offset       [:maybe :int]]
      [:last_scan_at [:maybe ms/TemporalInstant]]]
  "List **duplicated** findings - the latest valid `duplicated` finding per entity, permission-filtered
  for the current user. Each item is a flat identity + a top-level `duplicate_count` (the number of other
  same-type entities sharing the normalized name) + a nested `details` (collection, `description`,
  `owner`, `creator`, `normalized_name`, and the hydrated same-type `duplicate_entities` peers). Card
  items also carry a top-level `card_type` (`question`|`model`|`metric`) - card findings only,
  denormalized at scan time. Paginated via `limit`/`offset`; `total` is the full valid count.

  Params: `include-personal-collections` (default false) - when false, entities currently in a personal
  collection are excluded and personal-collection peers are omitted from `duplicate_entities`.
  `entity-types` (repeatable, omitted = all) narrows the flagged entity by type; the card sub-kinds are
  valid values, `card` means any card type, and `collection` finds same-named collections instance-wide,
  regardless of parent. Peers are not filtered - cards cluster across sub-kinds, so a model's peers can
  be questions.
  `min-duplicate-count` (positive int) keeps findings with at least that many peers. `query`
  case-insensitively substring-matches the entity name. `sort-column`
  (`detected-at`|`entity-type`|`name`|`created-at`|`created-by`|`collection-name`|`duplicate-count`,
  default `detected-at`) + `sort-direction` (`asc`|`desc`, default `asc`); `id` is the stable
  tiebreak."
  [_route-params
   {:keys [include-personal-collections sort-column sort-direction entity-types
           min-duplicate-count query]
    :or   {include-personal-collections false
           sort-column                   :detected-at
           sort-direction                :asc}}
   :- [:map
       [:include-personal-collections {:optional true} :boolean]
       [:sort-column         {:optional true} (ms/enum-decode-keyword (keys duplicated-sort-column->field))]
       [:sort-direction      {:optional true} (ms/enum-decode-keyword api.common/sort-directions)]
       [:entity-types        {:optional true} (entity-types-param duplicated-entity-types)]
       [:min-duplicate-count {:optional true} ms/PositiveInt]
       [:query               {:optional true} :string]]]
  (let [excluded-personal-ids (api.common/excluded-personal-collection-ids include-personal-collections)]
    (findings-response (duplicated-where-clause {:excluded-personal-collection-ids excluded-personal-ids
                                                 :entity-types                     entity-types
                                                 :min-duplicate-count              min-duplicate-count
                                                 :query                            query})
                       duplicated-sort-column->field sort-column sort-direction
                       excluded-personal-ids)))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the Content Diagnostics API."
  ;; Middleware is applied left-to-right, so the last one ends up outermost: `+auth` runs first and an
  ;; unauthenticated request still gets a 401 rather than the audience gate's 403. The param check is
  ;; innermost, so the audience gate's 403 likewise beats its 400.
  (api.macros/ns-handler *ns* +reject-undeclared-params +check-diagnostics-access +auth))
