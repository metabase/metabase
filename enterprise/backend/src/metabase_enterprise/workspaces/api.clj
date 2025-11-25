(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace/` routes"
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.promotion :as ws.promotion]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; schemas

(mr/def ::entity-type [:enum :transform])

(mr/def ::entity-grouping [:enum :transforms])

;; Map like {:transforms [1 2 3]}
(mr/def ::entity-map
  [:map-of ::entity-grouping [:sequential {:min 1} ms/PositiveInt]])

;; Entities that live within the Workspace
(mr/def ::downstream-entity
  [:map
   [:id ms/PositiveInt]
   [:upstream_id ms/PositiveInt]
   [:type ::entity-type]
   [:name :string]])

;; Entity reference used in requests
(mr/def ::entity-reference
  [:map
   [:type ::entity-type]
   [:id ms/PositiveInt]])

;; Graph node for view-graph endpoint
(mr/def ::graph-node
  [:map
   [:node_id :string]
   [:id ms/PositiveInt]
   [:type [:enum :table :transform]]
   [:title :string]
   [:dependents [:map-of [:enum :table :transform] ms/PositiveInt]]])

;; Graph edge for view-graph endpoint
(mr/def ::graph-edge
  [:map
   [:from :string]
   [:to :string]])

;; Error: entity that needs to be checked out
(mr/def ::unchecked-out-entity
  [:map
   [:type ::entity-type]
   [:id ms/PositiveInt]
   [:name :string]])

;; Error: entity that cannot be cloned
(mr/def ::uncloneable-entity
  [:map
   [:type ::entity-type]
   [:id ms/PositiveInt]
   [:name :string]
   [:error :string]])

;; Error response for graph-not-closed
(mr/def ::graph-not-closed-error
  [:map
   [:error [:= :graph-not-closed]]
   [:message :string]
   [:entities [:sequential ::unchecked-out-entity]]])

;; Error response for uncloneable entities
(mr/def ::uncloneable-error
  [:map
   [:error [:= :contains-uncloneable-entities]]
   [:message :string]
   [:entities [:sequential ::uncloneable-entity]]])

(def ^:private CreateWorkspace
  [:map
   [:name {:optional true} [:string {:min 1}]]
   [:database_id {:optional true} :int]
   [:upstream {:optional true} ::entity-map]])

(def ^:private AddEntities
  [:map
   [:upstream ::entity-map]])

(def ^:private RemoveEntities
  [:map
   [:downstream ::entity-map]])

(def Workspace
  "Schema for workspace response"
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:collection_id :int]
   [:database_id :int]
   [:created_at :any]
   [:updated_at :any]
   [:archived_at [:maybe :any]]
   [:contents [:map-of ::entity-grouping [:sequential ::downstream-entity]]]])

(def ^:private ExecuteResult
  "Schema for workspace execution result"
  [:map
   [:succeeded ::entity-map]
   [:failed ::entity-map]
   [:not_run ::entity-map]])

(def ^:private GraphResult
  "Schema for workspace graph visualization"
  [:map
   [:nodes [:sequential ::graph-node]]
   [:edges [:sequential ::graph-edge]]])

(defn- ws->response [ws]
  (select-keys ws
               [:id :name :collection_id :database_id :created_at :updated_at :archived_at :contents]))

;;; routes

(api.macros/defendpoint :get "/" :- [:map [:items [:sequential Workspace]]]
  "Get a list of all workspaces"
  [_route-params
   _query-params]
  {:items  (->> (t2/select :model/Workspace :archived_at [:is nil]
                           (cond-> {:order-by [[:created_at :desc]]}
                             (request/limit)  (sql.helpers/limit (request/limit))
                             (request/offset) (sql.helpers/offset (request/offset))))
                (t2/hydrate :contents)
                (mapv ws->response))
   :limit  (request/limit)
   :offset (request/offset)})

(api.macros/defendpoint :get "/:id" :- Workspace
  "Get a single workspace by ID"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (-> (api/check-404 (t2/select-one :model/Workspace :id id))
      (t2/hydrate :contents)
      ws->response))

(api.macros/defendpoint :post "/" :- Workspace
  "Create a new workspace

  Potential payload:
  {:name \"a\" :database_id 2 :upstream {:transforms [1 2 3]}}"
  [_route-params
   _query-params
   body :- CreateWorkspace]
  (-> (ws.common/create-workspace! api/*current-user-id* body)
      ws->response))

(api.macros/defendpoint :post "/:id/archive" :- Workspace
  "Archive a workspace. Deletes the isolated schema and tables, but preserves mirrored entities."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id id))]
    (api/check-400 (nil? (:archived_at ws)) "You cannot archive an archived workspace")
    (t2/update! :model/Workspace id {:archived_at [:now]})
    (-> (t2/select-one :model/Workspace :id id)
        ws->response)))

(api.macros/defendpoint :post "/:id/unarchive" :- Workspace
  "Restore an archived workspace. Recreates the isolated schema and tables."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id id))]
    (api/check-400 (some? (:archived_at ws)) "You cannot unarchive a workspace that is not archived")
    (t2/update! :model/Workspace id {:archived_at nil})
    (-> (t2/select-one :model/Workspace :id id)
        ws->response)))

(api.macros/defendpoint :delete "/:id" :- [:map [:ok [:= true]]]
  "Delete a workspace and all its contents, including mirrored entities."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO (Chris 11/21/25) -- implement actual deletion logic
  {:ok true})

(api.macros/defendpoint :post "/:id/execute" :- ExecuteResult
  "Execute all transforms in the workspace in dependency order.
   Returns which transforms succeeded, failed, and were not run."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (u/prog1 (t2/select-one :model/Workspace :id id)
    (api/check-404 <>)
    (api/check-400 (nil? (:archived_at <>)) "Cannot execute archived workspace"))
  ;; TODO (Chris 11/21/25) -- implement execution logic
  {:succeeded []
   :failed    []
   :not_run   []})

(api.macros/defendpoint :get "/:id/graph" :- GraphResult
  "Get the dependency graph for a workspace, for visualization.
   Shows tables and transforms the workspace depends on, with edges representing dependencies.
   Tables produced by transforms in the workspace are not shown; instead, dependencies appear
   directly between transforms."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO (Chris 11/21/25) -- implement graph generation logic
  {:nodes []
   :edges []})

(api.macros/defendpoint :post "/:id/merge" :- Workspace
  "Merge workspace changes back to live entities and archive the workspace.
   Updates all entities in the workspace to match their mirrored versions."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO (Chris 11/21/25) -- implement merge logic
  (-> (t2/select-one :model/Workspace :id id)
      ws->response))

(api.macros/defendpoint :post "/:id/add-entities"
  :- [:map [:contents [:map-of ::entity-grouping [:sequential ::downstream-entity]]]]
  "Add entities to workspace"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- AddEntities]
  1)

(api.macros/defendpoint :post "/:id/remove-entities"
  :- [:map [:success ms/BooleanValue]]
  "Remove entities from workspace"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- RemoveEntities]
  1)

(api.macros/defendpoint :get "/mapping/transform/:id/downstream"
  :- [:map
      [:transforms [:sequential
                    [:map
                     [:id ms/PositiveInt]
                     [:name :string]
                     [:workspace [:map
                                  [:id ms/PositiveInt]
                                  [:name :string]]]]]]]
  "Get all downstream transforms for a transform that is not in a workspace.
   Returns the transforms that were mirrored from this upstream transform, with workspace info."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (let [mappings         (t2/select :model/WorkspaceMappingTransform :upstream_id id)
        _                (when (empty? mappings) (api/check-404 (t2/exists? :model/Workspace id)))
        tid->wid         (u/for-map [m mappings]
                           [(:downstream_id m) (:workspace_id m)])
        transform-ids    (map :downstream_id mappings)
        workspace-ids    (map :workspace_id mappings)
        transforms       (when (seq transform-ids)
                           (t2/select [:model/Transform :id :name] :id [:in transform-ids] {:order-by [:created_at]}))
        workspaces-by-id (when (seq workspace-ids)
                           (u/index-by :id (t2/select [:model/Workspace :id :name] :id [:in workspace-ids])))]
    {:transforms (for [transform transforms]
                   (assoc transform :workspace (get workspaces-by-id (tid->wid (:id transform)))))}))

(api.macros/defendpoint :post "/:id/merge"
  #_#_:- [:or
          [:map
           [:promoted [:sequential [:map [:id ms/PositiveInt] [:name :string]]]]
           [:errors {:optional true} [:sequential [:map [:id ms/PositiveInt] [:name :string] [:error :string]]]]
           [:workspace [:map [:id ms/PositiveInt] [:name :string]]]
           [:archived_at [:maybe :any]]]
      ;; error message from check-404 or check-400
          :string]
  "Promote workspace transforms back to main Metabase and archive the workspace.

  This will:
  1. Update original transforms with workspace versions
  2. Re-execute transforms in the original schema
  3. Archive the workspace and clean up isolated resources

  Returns a report of promoted transforms and any errors."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (let [ws               (u/prog1 (t2/select-one :model/Workspace :id id)
                           (api/check-404 <>)
                           (api/check-400 (nil? (:archived_at <>)) "Cannot promote an already archived workspace"))
        {:keys [promoted
                errors]} (ws.promotion/promote-transforms! ws)]
    (u/prog1
      {:promoted    (vec promoted)
       :errors      errors
       :workspace   {:id id :name (:name ws)}
       :archived_at (when-not (seq errors)
                      (t2/update! :model/Workspace :id id {:archived_at [:now]})
                      (t2/select-one-fn :archived_at [:model/Workspace :archived_at] :id id))}
      (when-not (seq errors)
        ;; Most of the APIs and the FE are not respecting when a Workspace is archived yet.
        (t2/delete! :model/Workspace id)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace/` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
