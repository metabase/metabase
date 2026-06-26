(ns metabase-enterprise.content-diagnostics.api
  "Content Diagnostics API. Mounted under `premium-handler … :content-diagnostics` (feature-gated) — see
  `api_routes/routes.clj`. Exposes a synchronous **demo-only** `/scan` trigger and a paginated,
  batch-hydrated latest-per-entity finding list."
  (:require
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

;;; ------------------------------------------- display hydration ---------------------------------------
;;; Display fields (entity name + current collection) are hydrated live (always-current), batched per
;;; entity-type — NOT per row. One `IN`-query per entity-type on the page replaces the old per-row N+1.

(defn- display-fields
  "{entity-id → {:name … :collection_id …}} for one entity-type's id set, in a single query."
  [entity-type ids]
  (when-let [model (detect/entity-type->model entity-type)]
    (t2/select-pk->fn #(select-keys % [:name :collection_id])
                      [model :id :name :collection_id]
                      :id [:in ids])))

(defn- hydrate-display
  "Add :name + :collection_id to each finding via ≤1 query per entity-type (page-size-independent)."
  [findings]
  (let [lookup (into {} (for [[etype rows] (group-by :entity_type findings)]
                          [etype (display-fields etype (map :entity_id rows))]))]
    (mapv (fn [{:keys [entity_type entity_id] :as finding}]
            (let [fields (get-in lookup [entity_type entity_id])]
              (assoc finding
                     :name          (:name fields)
                     :collection_id (:collection_id fields))))
          findings)))

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
      [:data   [:sequential :map]]
      [:total  :int]
      [:limit  [:maybe :int]]
      [:offset [:maybe :int]]]
  "List active **stale** findings — the latest non-invalidated `stale` finding per entity. Paginated via
  the standard `limit`/`offset` query params; `total` is the full active count. Display fields (name,
  collection) are batch-hydrated live."
  []
  (let [where (active-where "stale")
        page  (t2/select :model/ContentDiagnosticsFinding
                         (cond-> {:where    where
                                  :order-by [[:id :asc]]}
                           (request/limit)  (assoc :limit (request/limit))
                           (request/offset) (assoc :offset (request/offset))))]
    {:data   (hydrate-display page)
     :total  (t2/count :model/ContentDiagnosticsFinding {:where where})
     :limit  (request/limit)
     :offset (request/offset)}))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the Content Diagnostics API."
  (api.macros/ns-handler *ns* +auth))
