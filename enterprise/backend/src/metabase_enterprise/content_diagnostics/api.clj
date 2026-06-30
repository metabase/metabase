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
   [medley.core :as m]
   [metabase-enterprise.content-diagnostics.detect :as detect]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.request.core :as request]
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
;;; Every finding's display context — entity name, collection breadcrumb, description, owner, creator —
;;; is hydrated **live** (always-current; a renamed/moved entity shows correctly) and **batched per
;;; entity-type**, never per row: ≤1 entity select + ≤1 `:creator` hydrate per entity-type on the page,
;;; plus a small fixed number of collection queries for the breadcrumbs (one select + the
;;; permission-filtered `:effective_ancestors` hydrate). Page-size-independent (no per-row N+1). This is
;;; the layer each per-finding-type endpoint reuses.

(defn- normalize-user
  "A hydrated `:model/User` → the response's normalized user object `{id, name, email, type}`, or nil.
  `name` prefers the user's `common_name`, but the per-model `:creator`/`:owner` hydrates on Document and
  Transform select only `first_name`/`last_name`/`email` (no `common_name`), so it falls back to the
  assembled full name, then the email. Used for `creator` and the Metabase-account case of `owner`."
  [user]
  (when user
    {:id    (:id user)
     :name  (or (:common_name user)
                (not-empty (str/trim (str (:first_name user) " " (:last_name user))))
                (:email user))
     :email (:email user)
     :type  :user}))

(defn- normalize-owner
  "A hydrated `:owner` → the response's normalized owner object, or nil. A transform owner is **either** a
  Metabase user (`owner_user_id` → a User instance with an `:id`) → normalized like a creator, **or** an
  external email (`owner_email` → a bare `{:email …}` map) → `{email, type:external}`. Card/Dashboard/
  Document have no owner column, so their `:owner` is absent → nil."
  [owner]
  (cond
    (nil? owner)   nil
    (:id owner)    (normalize-user owner)
    (:email owner) {:email (:email owner) :type :external}))

(def ^:private entity-base-columns
  "Per-entity-type display projection. All four expose `name`/`collection_id`/`creator_id`; Document has
  **no** `description` column (so it is omitted there → served as nil); Transform additionally carries the
  two owner columns it can be hydrated from."
  {:card      [:id :name :description :collection_id :creator_id]
   :dashboard [:id :name :description :collection_id :creator_id]
   :document  [:id :name :collection_id :creator_id]
   :transform [:id :name :description :collection_id :creator_id :owner_user_id :owner_email]})

(defn- entity-context
  "For one entity-type's id set → `{entity-id → entity-row}` with `:creator` (always) and, for Transform,
  `:owner` hydrated. Each row is later projected by [[hydrate-findings]] into the served `details`. The
  column projection is per-type ([[entity-base-columns]]) because the models differ (Document lacks a
  description; only Transform has owner columns)."
  [entity-type ids]
  (when-let [model (detect/entity-type->model entity-type)]
    (let [rows (cond-> (t2/select (into [model] (entity-base-columns entity-type)) :id [:in (set ids)])
                 :always                    (t2/hydrate :creator)
                 (= entity-type :transform) (t2/hydrate :owner))]
      (m/index-by :id rows))))

(defn- hydrate-slow-entities
  "Card-id set → `{card-id → {:id :name :entity_type :card :card_type <kw>}}`. The serve-time hydration of
  a `slow` roll-up's stored culprit ids (`slow_entity_ids`) into objects (D16). `card_type` is the
  `report_card.type` enum (question/model/metric) that drives the FE per-member link/icon. Batched."
  [card-ids]
  (when (seq card-ids)
    ;; `:card_schema` is required on any Card select — its after-select schema-upgrade hook reads it.
    (t2/select-pk->fn (fn [c] {:id (:id c) :name (:name c) :entity_type :card :card_type (:type c)})
                      [:model/Card :id :name :type :card_schema]
                      :id [:in (set card-ids)])))

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

(defn- hydrate-finding-details
  "Stored loose `details` → served `details`: merge the live context (collection breadcrumb, description,
  owner, creator) onto the frozen verdict, and replace any stored roll-up culprit ids (`slow_entity_ids`)
  with hydrated `slow_entities` objects. Leaf verdicts (no `slow_entity_ids`) pass through unchanged."
  [details entity culprits breadcrumbs]
  (let [base (merge details
                    {:collection  (get breadcrumbs (:collection_id entity))
                     :description (:description entity)
                     :owner       (normalize-owner (:owner entity))
                     :creator     (normalize-user (:creator entity))})]
    (if-let [culprit-ids (:slow_entity_ids details)]
      (-> base
          (dissoc :slow_entity_ids)
          (assoc :slow_entities (into [] (keep culprits) culprit-ids)))
      base)))

(defn- hydrate-findings
  "Project stored findings into the served shape: flat identity + `entity_display_name`, plus a nested
  typed `details` = stored verdict ∪ {collection breadcrumb, description, owner, creator} ∪ (for roll-ups)
  hydrated `slow_entities`. Batched and page-size-independent (see the layer note above)."
  [findings]
  (let [ctx-by-type (into {} (for [[etype rows] (group-by :entity_type findings)]
                               [etype (entity-context etype (map :entity_id rows))]))
        coll-ids    (into #{} (keep (fn [{:keys [entity_type entity_id]}]
                                      (get-in ctx-by-type [entity_type entity_id :collection_id])))
                          findings)
        breadcrumbs (collection-breadcrumbs coll-ids)
        culprits    (hydrate-slow-entities (into #{} (mapcat (comp :slow_entity_ids :details)) findings))]
    (mapv (fn [{:keys [id finding_type entity_type entity_id detected_at details]}]
            (let [entity (get-in ctx-by-type [entity_type entity_id])]
              {:id                  id
               :finding_type        finding_type
               :entity_type         entity_type
               :entity_id           entity_id
               :detected_at         detected_at
               :entity_display_name (:name entity)
               :details             (hydrate-finding-details details entity culprits breadcrumbs)}))
          findings)))

(defn- last-scan-at
  "`detected_at` of the most recent finding overall (≈ the latest scan's time), or nil if none."
  []
  (t2/select-one-fn :detected_at :model/ContentDiagnosticsFinding {:order-by [[:id :desc]]}))

(defn- serve-findings
  "Shared per-finding-type serve: page the active (latest-per-entity, non-invalidated) findings of one
  `finding-type` **that the current caller may read**, batch-hydrate them, and wrap in the standard
  `{data,total,limit,offset,last_scan_at}` envelope. Visibility (`visible-findings-where`) is always
  applied; personal collections are excluded (`exclude-personal-collections-where`) unless
  `include-personal-collections`. `total` is the full visible active count."
  [finding-type include-personal-collections]
  (let [pers  (when-not include-personal-collections (exclude-personal-collections-where))
        where (cond-> [:and (active-where finding-type) (visible-findings-where)]
                pers (conj pers))
        page  (t2/select :model/ContentDiagnosticsFinding
                         (cond-> {:where    where
                                  :order-by [[:id :asc]]}
                           (request/limit)  (assoc :limit (request/limit))
                           (request/offset) (assoc :offset (request/offset))))]
    {:data         (hydrate-findings page)
     :total        (t2/count :model/ContentDiagnosticsFinding {:where where})
     :limit        (request/limit)
     :offset       (request/offset)
     :last_scan_at (last-scan-at)}))

;;; -------------------------------------------- response schema ----------------------------------------

(def ^:private NormalizedUser
  "A finding's `owner`/`creator`: a Metabase user `{id,name,email,type:user}`, or — for an external
  transform owner — `{email,type:external}`, or nil. Keys optional to admit both variants."
  [:maybe [:map
           [:id    {:optional true} [:maybe :int]]
           [:name  {:optional true} [:maybe :string]]
           [:email {:optional true} [:maybe :string]]
           [:type  :keyword]]])

(def ^:private StaleFinding
  "Served `stale` finding: flat identity + nested typed `details`."
  [:map
   [:id                  :int]
   [:finding_type        :keyword]
   [:entity_type         :keyword]
   [:entity_id           :int]
   [:detected_at         some?]
   [:entity_display_name [:maybe :string]]
   [:details
    [:map
     [:collection     [:maybe :map]]
     [:description    [:maybe :string]]
     [:owner          NormalizedUser]
     [:creator        NormalizedUser]
     [:threshold_days {:optional true} :int]]]])

(def ^:private finding-identity
  "The flat top-level identity shared by every served finding (sans entity_type, which each schema pins)."
  [[:id                  :int]
   [:finding_type        :keyword]
   [:entity_id           :int]
   [:detected_at         some?]
   [:entity_display_name [:maybe :string]]])

(def ^:private details-context
  "The live-hydrated context every finding's `details` carries, regardless of finding-type."
  [[:collection  [:maybe :map]]
   [:description [:maybe :string]]
   [:owner       NormalizedUser]
   [:creator     NormalizedUser]])

(def ^:private SlowEntity
  "A hydrated `slow` roll-up culprit (currently always a card): `{id, name, entity_type, card_type?}`."
  [:map
   [:id          :int]
   [:name        [:maybe :string]]
   [:entity_type :keyword]
   [:card_type   {:optional true} [:maybe :keyword]]])

(def ^:private SlowLeafFinding
  "Served `slow` finding for a **leaf** (card/transform): the verdict freezes the measured `duration_ms`
  and the `threshold_ms` (D17)."
  (into [:map [:entity_type [:enum :card :transform]]]
        (conj finding-identity
              [:details (into [:map [:duration_ms :int] [:threshold_ms :int]] details-context)])))

(def ^:private SlowContainerFinding
  "Served `slow` finding for a **container** (dashboard/document): the verdict is the hydrated set of slow
  member cards (`slow_entities`)."
  (into [:map [:entity_type [:enum :dashboard :document]]]
        (conj finding-identity
              [:details (into [:map [:slow_entities [:sequential SlowEntity]]] details-context)])))

(def ^:private SlowFinding
  "Served `slow` finding — leaf vs container `details` discriminated on the top-level `entity_type`."
  [:multi {:dispatch :entity_type}
   [:card      SlowLeafFinding]
   [:transform SlowLeafFinding]
   [:dashboard SlowContainerFinding]
   [:document  SlowContainerFinding]])

(def ^:private serve-query-params
  "Shared query params for the per-finding-type serve endpoints (kebab-case, deps-parity). `total`/page
  are always collection-visibility filtered for the caller; `include-personal-collections` (default false,
  mirrors `dependencies/api.clj`) additionally admits personal-collection findings the caller can read."
  [:map [:include-personal-collections {:optional true} :boolean]])

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
  "List active **stale** findings — the latest non-invalidated `stale` finding per entity the caller may
  read. Each item is flat identity + a nested typed `details` (collection breadcrumb, `description`,
  `owner`, `creator`, `threshold_days`), all batch-hydrated live. Collection-visibility filtered;
  personal collections excluded unless `include-personal-collections`. Paginated via the standard
  `limit`/`offset`; `total` is the full visible active count."
  [_route-params
   {:keys [include-personal-collections]
    :or   {include-personal-collections false}} :- serve-query-params]
  (serve-findings "stale" include-personal-collections))

(api.macros/defendpoint :get "/slow"
  :- [:map
      [:data         [:sequential SlowFinding]]
      [:total        :int]
      [:limit        [:maybe :int]]
      [:offset       [:maybe :int]]
      [:last_scan_at [:maybe some?]]]
  "List active **slow** findings — the latest non-invalidated `slow` finding per entity the caller may
  read. `details` varies by `entity_type`: leaves (card/transform) carry the frozen
  `duration_ms`/`threshold_ms`; containers (dashboard/document) carry the hydrated `slow_entities` culprit
  cards. All context (collection breadcrumb, `description`, `owner`, `creator`) is batch-hydrated live.
  Collection-visibility filtered; personal collections excluded unless `include-personal-collections`.
  Paginated via the standard `limit`/`offset`; `total` is the full visible active count."
  [_route-params
   {:keys [include-personal-collections]
    :or   {include-personal-collections false}} :- serve-query-params]
  (serve-findings "slow" include-personal-collections))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the Content Diagnostics API."
  (api.macros/ns-handler *ns* +auth))
