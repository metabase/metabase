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
   [medley.core :as m]
   [metabase-enterprise.content-diagnostics.detect :as detect]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
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

;;; ----------------------------------- display hydration (shared layer) --------------------------------
;;; Every finding's display context — entity name, collection breadcrumb, description, owner, creator —
;;; is hydrated **live** (always-current; a renamed/moved entity shows correctly) and **batched per
;;; entity-type**, never per row: ≤1 entity select + ≤1 `:creator` hydrate per entity-type on the page,
;;; plus a small fixed number of collection queries for the breadcrumbs (one select + the
;;; permission-filtered `:effective_ancestors` hydrate). Page-size-independent (no per-row N+1). This is
;;; the layer each per-finding-type endpoint reuses.

(defn- normalize-user
  "A hydrated `:model/User` → the response's normalized user object `{id, name, email, type}`, or nil.
  `name` is the user's `common_name` (added on every User select). Used for both `creator` and the
  Metabase-account case of `owner`."
  [user]
  (when user
    {:id    (:id user)
     :name  (:common_name user)
     :email (:email user)
     :type  :user}))

(defn- entity-context
  "For one entity-type's id set → `{entity-id → {:name :description :collection_id :creator}}`.
  Card and Dashboard both carry `creator_id` (hydrated via `:creator`) and have **no** owner column, so
  `owner` is nil for them — Document/Transform owner hydration lands with their stale coverage."
  [entity-type ids]
  (when-let [model (detect/entity-type->model entity-type)]
    (let [rows (t2/hydrate (t2/select [model :id :name :description :collection_id :creator_id]
                                      :id [:in (set ids)])
                           :creator)]
      (m/index-by :id rows))))

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
  "Project stored findings into the served shape: flat identity + `entity_display_name`, plus a nested
  typed `details` = stored verdict ∪ {collection breadcrumb, description, owner, creator}. Batched and
  page-size-independent (see the layer note above)."
  [findings]
  (let [ctx-by-type (into {} (for [[etype rows] (group-by :entity_type findings)]
                               [etype (entity-context etype (map :entity_id rows))]))
        coll-ids    (into #{} (keep (fn [{:keys [entity_type entity_id]}]
                                      (get-in ctx-by-type [entity_type entity_id :collection_id])))
                          findings)
        breadcrumbs (collection-breadcrumbs coll-ids)]
    (mapv (fn [{:keys [id finding_type entity_type entity_id detected_at details]}]
            (let [entity (get-in ctx-by-type [entity_type entity_id])]
              {:id                  id
               :finding_type        finding_type
               :entity_type         entity_type
               :entity_id           entity_id
               :detected_at         detected_at
               :entity_display_name (:name entity)
               :details             (merge details
                                           {:collection  (get breadcrumbs (:collection_id entity))
                                            :description (:description entity)
                                            ;; card/dashboard have no owner column → null; creator is the author.
                                            :owner       nil
                                            :creator     (normalize-user (:creator entity))})}))
          findings)))

(defn- last-scan-at
  "`detected_at` of the most recent finding overall (≈ the latest scan's time), or nil if none."
  []
  (t2/select-one-fn :detected_at :model/ContentDiagnosticsFinding {:order-by [[:id :desc]]}))

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
  `total` is the full active count."
  []
  (let [where (active-where "stale")
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

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the Content Diagnostics API."
  (api.macros/ns-handler *ns* +auth))
