(ns metabase-enterprise.content-diagnostics.api
  "Content Diagnostics API. Mounted under `premium-handler … :content-diagnostics` (feature-gated) — see
  `api_routes/routes.clj`. Exposes a synchronous **demo-only** `/scan` trigger and a paginated,
  batch-hydrated latest-per-entity finding list.

  Serve shape (the cross-cutting contract every per-finding-type endpoint conforms to): a minimal flat
  identity — `id, finding_type, entity_type, entity_id, detected_at, entity_display_name` — plus a nested
  typed `details` that merges the stored verdict with live-hydrated context: the `collection` breadcrumb,
  the entity's `description`, and two distinct user objects, `owner` and `creator`. `hint`/`url` are not
  returned — the FE builds them."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.content-diagnostics.detect :as detect]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- latest-per-entity-ids
  "Subquery selecting the id of the most-recent finding for each (entity_type, entity_id, finding_type).
  Recency = MAX(id): id is a monotonic autoincrement, whereas `scan_id` is a random UUID and cannot be
  ordered by recency. Portable across every app-db engine (h2/mysql/postgres) — plain MAX + GROUP BY,
  no `DISTINCT ON`/window functions. Serving latest-per-entity (rather than only the single newest
  `scan_id`) keeps results coherent under chunk-committed/partial scans: an entity the newest scan
  hasn't re-written yet still shows its last known finding instead of vanishing."
  []
  {:select   [[[:max :id] :id]]
   :from     [(t2/table-name :model/ContentDiagnosticsFinding)]
   :group-by [:entity_type :entity_id :finding_type]})

(defn- active-where
  "Predicate for the served set of one `finding-type`: its latest finding per entity, excluding any whose
  latest row was invalidated (`stale = true`). Picking MAX(id) over *all* rows then filtering `stale =
  false` means an invalidated latest row hides the entity, and an older non-stale row does NOT resurface."
  [finding-type]
  [:and
   [:= :stale false]
   [:= :finding_type finding-type]
   [:in :id (latest-per-entity-ids)]])

;;; ------------------------------ per-caller serve filters (shared) ------------------------------------
;;; The scan is user-less, so the findings table is a permission-agnostic substrate — every per-caller
;;; concern is resolved **live at serve time** against each finding entity's *current* collection (never the
;;; scan-time `scope_collection_id`), mirroring Dependency Diagnostics' live filtering over its async graph.
;;; Two filters compose, both built per entity-type from `detect/entity-type->model`:
;;;   1. visibility — `visible-findings-where`, ALWAYS applied (a user sees only content they can read).
;;;   2. personal collections — `exclude-personal-collections-where`, gated by `include-personal-collections`.
;;; These are the shared filters every per-finding-type endpoint reuses.

(defn- visible-findings-where
  "Keep only findings whose entity is in a collection the **current user** can read — per-caller, live, and
  unconditional (the served page is permission-filtered like Dependency Diagnostics). Resolved per
  entity-type against the entity's current `collection_id` via `collection/visible-collection-filter-clause`,
  which reads `api/*current-user-id*` / `api/*is-superuser?*`. A finding whose `entity_type` has no
  collection model is **not** kept (fail-closed — nothing to gate on; all current stale types are
  collection-bound card/dashboard)."
  []
  (into [:or]
        (for [[etype model] detect/entity-type->model]
          [:and
           [:= :entity_type (name etype)]
           [:in :entity_id {:select [:id]
                            :from   [(t2/table-name model)]
                            :where  (collection/visible-collection-filter-clause :collection_id)}]])))

(defn- personal-collection-ids
  "Live set of every collection id that **is**, or is **nested under**, a personal collection — the same
  rule `:is_personal` uses (`collection.clj`): a personal root (`personal_owner_id` set) plus any descendant
  (`location` under a personal root). Empty set when the instance has no personal collections."
  []
  (if-let [roots (not-empty (t2/select-pks-vec :model/Collection :personal_owner_id [:not= nil]))]
    (t2/select-pks-set :model/Collection
                       {:where (into [:or [:in :id roots]]
                                     (map (fn [pid] [:like :location (str "/" pid "/%")]))
                                     roots)})
    #{}))

(defn- name-search-where
  "Case-insensitive substring match on the denormalized `entity_name` (a native column ⇒ no join). Nil for a
  blank/absent query, so a blank search is a no-op. `%`/`_` in the term are not escaped — they act as SQL
  LIKE wildcards, matching the fuzzy name-search behavior used elsewhere in the app."
  [query]
  (when-let [q (some-> query str/trim not-empty u/lower-case-en)]
    [:like [:lower :entity_name] (str "%" q "%")]))

(defn- exclude-personal-collections-where
  "WHERE fragment dropping findings whose entity **currently** lives in a personal collection. Resolved live
  per entity-type (`detect/entity-type->model`) against the entity's current `collection_id`, so root items
  (`collection_id` nil) and entities in regular collections are kept. Nil when there is nothing to exclude."
  []
  (when-let [pids (seq (personal-collection-ids))]
    (into [:and]
          (for [[etype model] detect/entity-type->model]
            [:not [:and
                   [:= :entity_type (name etype)]
                   [:in :entity_id {:select [:id]
                                    :from   [(t2/table-name model)]
                                    :where  [:in :collection_id pids]}]]]))))

;;; ----------------------------------- display hydration (shared layer) --------------------------------
;;; A finding's display values come from two places. **Denormalized** (frozen at scan time, preferred over
;;; live hydration — some drift between scans is acceptable): `entity_display_name`, `created_at`,
;;; `last_active_at`, and the `creator` object (id + name). **Live-hydrated** (still current, batched per
;;; entity-type — no per-row N+1): the entity `description` and the permission-filtered `collection`
;;; breadcrumb, neither of which is denormalized. This is the layer each per-finding-type endpoint reuses.

(defn- entity-context
  "For one entity-type's id set → `{entity-id → {:description :collection_id}}`. Only the **non-denormalized**
  display fields are hydrated live — the `description` and the `collection_id` that feeds the breadcrumb;
  name + creator are served from the finding's denormalized columns (no `:name`/`:creator` hydrate)."
  [entity-type ids]
  (when-let [model (detect/entity-type->model entity-type)]
    (m/index-by :id (t2/select [model :id :description :collection_id] :id [:in (set ids)]))))

(defn- collection-breadcrumbs
  "For a set of collection ids → `{collection-id → {:id :name :effective_ancestors [{:id :name} …]}}`.
  Hydrates the canonical `:effective_ancestors` breadcrumb (`collection.clj`, the same hydrate that
  powers the UI breadcrumb path) — permission-filtered, so ancestors the current user can't see are
  hidden. The full collection row is selected (not a projection) because the hydrate needs `:location`
  to compute the path. Entities with no collection (root / nil) get no entry, so the caller surfaces
  `collection: nil`."
  [coll-ids]
  (when (seq coll-ids)
    (let [colls (t2/hydrate (t2/select :model/Collection :id [:in (set coll-ids)])
                            :effective_ancestors)]
      (into {}
            (map (fn [c]
                   [(:id c)
                    {:id                  (:id c)
                     :name                (:name c)
                     :effective_ancestors (mapv #(select-keys % [:id :name]) (:effective_ancestors c))}]))
            colls))))

(defn- hydrate-findings
  "Project stored findings into the served shape: flat identity + denormalized `entity_display_name` /
  `created_at` / `last_active_at`, plus a nested typed `details` = stored verdict ∪ {collection breadcrumb,
  description, owner, creator}. Name + creator come from the finding's denormalized columns; description +
  collection are live-hydrated. Batched, page-size-independent (see the layer note above)."
  [findings]
  (let [ctx-by-type (into {} (for [[etype rows] (group-by :entity_type findings)]
                               [etype (entity-context etype (map :entity_id rows))]))
        coll-ids    (into #{} (keep (fn [{:keys [entity_type entity_id]}]
                                      (get-in ctx-by-type [entity_type entity_id :collection_id])))
                          findings)
        breadcrumbs (collection-breadcrumbs coll-ids)]
    (mapv (fn [{:keys [id finding_type entity_type entity_id detected_at last_active_at entity_created_at
                       entity_name entity_creator_id entity_creator_name details]}]
            (let [entity (get-in ctx-by-type [entity_type entity_id])]
              {:id                  id
               :finding_type        finding_type
               :entity_type         entity_type
               :entity_id           entity_id
               :detected_at         detected_at
               :entity_display_name entity_name
               :last_active_at      last_active_at
               :created_at          entity_created_at
               :details             (merge details
                                           {:collection  (get breadcrumbs (:collection_id entity))
                                            :description (:description entity)
                                            ;; card/dashboard have no owner column → null.
                                            :owner       nil
                                            ;; creator denormalized (id + common_name) — no live :creator hydrate.
                                            :creator     (when entity_creator_id
                                                           {:id entity_creator_id :name entity_creator_name :type :user})})}))
          findings)))

(defn- last-scan-at
  "`detected_at` of the most recent finding overall (≈ the latest scan's time), or nil if none."
  []
  (t2/select-one-fn :detected_at :model/ContentDiagnosticsFinding {:order-by [[:id :desc]]}))

;;; -------------------------------------------- response schema ----------------------------------------

(def ^:private NormalizedUser
  "A finding's `owner`: a Metabase user `{id,name,email,type:user}`, or — for an external transform owner —
  `{email,type:external}`, or nil. Keys optional to admit both variants."
  [:maybe [:map
           [:id    {:optional true} [:maybe :int]]
           [:name  {:optional true} [:maybe :string]]
           [:email {:optional true} [:maybe :string]]
           [:type  :keyword]]])

(def ^:private Creator
  "A finding's `creator`: always a real Metabase user (`creator_id` is a FK → `core_user`), served from the
  denormalized `entity_creator_id`/`entity_creator_name` as `{id, name, type:user}`, or nil for entity types
  with no creator. **No `email`** (deliberately not denormalized — closed map forbids it), and `type` is
  always `:user` (a creator is never external, unlike owner)."
  [:maybe [:map {:closed true}
           [:id   :int]
           [:name [:maybe :string]]
           [:type [:= :user]]]])

(def ^:private StaleFinding
  "Served `stale` finding: flat identity + nested typed `details`."
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

(def ^:private sort-directions
  "Valid sort directions for the stale list."
  #{:asc :desc})

(def ^:private sort-column->field
  "Sortable stale-list params → their native `content_diagnostics_finding` column. The entity attributes
  (`name`/`created-at`/`last-used-at`/`created-by`) are **denormalized at scan time** (see
  `detect/stale-checker`), so sorting stays a plain indexed `ORDER BY` with no join. `created-by` orders by
  the denormalized creator `common_name` (`entity_creator_name`) — alphabetical, no `core_user` join."
  {:detected-at  :detected_at
   :entity-type  :entity_type
   :name         :entity_name
   :created-at   :entity_created_at
   :created-by   :entity_creator_name
   :last-used-at :last_active_at})

(def ^:private stale-entity-types
  "Entity types the `stale` finding type covers per spec. `card`/`dashboard` emit today; `document`/
  `transform` are reserved — the enum accepts them now so the filter is forward-compatible (they simply
  match no rows until their stale coverage lands)."
  #{:card :dashboard :document :transform})

;;; ------------------------------------------------ endpoints ------------------------------------------

(api.macros/defendpoint :post "/scan"
  :- [:map
      [:scan_id          :string]
      [:finding_count    :int]
      [:entities_scanned :int]
      [:duration_ms      :int]]
  "Run a scan **synchronously** and return its topline. Demo/dev-only — the production trigger is the
  scheduled Quartz job. Synchronous (calls `detect/scan!` directly, not `trigger-now!`) so it works with
  the scheduler disabled (`MB_DISABLE_SCHEDULER=true`)."
  []
  (detect/scan!))

(api.macros/defendpoint :get "/stale"
  :- [:map
      [:data         [:sequential StaleFinding]]
      [:total        :int]
      [:limit        [:maybe :int]]
      [:offset       [:maybe :int]]
      [:last_scan_at [:maybe some?]]]
  "List active **stale** findings — the latest non-invalidated `stale` finding per entity. Each item is
  flat identity + a nested typed `details` (collection breadcrumb, `description`, `owner`, `creator`,
  `threshold_days`), all batch-hydrated live. Paginated via the standard `limit`/`offset` query params;
  `total` is the full active count.

  Results are always **permission-filtered** for the current user (a user sees only findings for content
  they can read). `include-personal-collections` (default **false**, deps-parity): when false, findings
  whose entity currently lives in a personal collection are also excluded. `entity-types` (repeatable;
  `card`|`dashboard`|`document`|`transform`) narrows to the given entity types (omitted = all).
  `threshold-days` (positive int) keeps only findings at least that stale — `last_active_at` on or before
  `today − threshold-days` (never-used findings always pass). `query` case-insensitively substring-matches
  the entity name (denormalized `entity_name`). All resolved live at serve time, instance-wide.
  Sortable by `sort-column` (`detected-at`|`entity-type`|`name`|`created-at`|`created-by`|`last-used-at` —
  all native columns, the entity attrs denormalized at scan time; default `detected-at`) + `sort-direction`
  (`asc`|`desc`, default `asc`); `id` is the stable tiebreak."
  [_route-params
   {:keys [include-personal-collections sort-column sort-direction entity-types threshold-days query]
    :or   {include-personal-collections false
           sort-column                   :detected-at
           sort-direction                :asc}}
   :- [:map
       [:include-personal-collections {:optional true} :boolean]
       [:sort-column    {:optional true} (ms/enum-decode-keyword (keys sort-column->field))]
       [:sort-direction {:optional true} (ms/enum-decode-keyword sort-directions)]
       [:entity-types   {:optional true} [:or
                                          (ms/enum-decode-keyword stale-entity-types)
                                          [:sequential (ms/enum-decode-keyword stale-entity-types)]]]
       [:threshold-days {:optional true} ms/PositiveInt]
       [:query          {:optional true} :string]]]
  (let [personal-filter    (when-not include-personal-collections (exclude-personal-collections-where))
        entity-types*      (when entity-types (if (sequential? entity-types) entity-types [entity-types]))
        entity-type-filter (when-let [types (not-empty entity-types*)] [:in :entity_type (mapv name types)])
        ;; "less stale than threshold-days" = active more recently than the cutoff → excluded. Never-used
        ;; (`last_active_at` nil) is maximally stale, so it always passes. Mirrors the scan-time cutoff.
        threshold-filter   (when threshold-days
                             (let [cutoff (t/minus (t/local-date) (t/days threshold-days))]
                               [:or [:= :last_active_at nil] [:<= :last_active_at cutoff]]))
        name-search-filter (name-search-where query)
        where              (cond-> [:and (active-where "stale") (visible-findings-where)]
                             personal-filter    (conj personal-filter)
                             entity-type-filter (conj entity-type-filter)
                             threshold-filter   (conj threshold-filter)
                             name-search-filter (conj name-search-filter))
        page               (t2/select :model/ContentDiagnosticsFinding
                                      (cond-> {:where    where
                                               :order-by [[(sort-column->field sort-column) sort-direction]
                                                          [:id sort-direction]]}
                                        (request/limit)  (assoc :limit (request/limit))
                                        (request/offset) (assoc :offset (request/offset))))]
    {:data         (hydrate-findings page)
     :total        (t2/count :model/ContentDiagnosticsFinding {:where where})
     :limit        (request/limit)
     :offset       (request/offset)
     :last_scan_at (last-scan-at)}))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the Content Diagnostics API."
  (api.macros/ns-handler *ns* +auth))
