(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace/` routes"
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; schemas

(def ^:private type->t2-model {:transform :model/Transform})

;; The key we use to group entities of the same type in requests and responses.
(def ^:private type->grouping {:transform :transforms})

(mr/def ::entity-type [:enum :transform])

(mr/def ::entity-grouping [:enum :transforms])

;; Entities that live within the Workspace
(mr/def ::downstream-entity
  [:map
   [:id ms/PositiveInt]
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
   [:id ms/PositiveInt]
   [:type [:enum :table :transform]]
   [:data :map]])

;; Graph edge for view-graph endpoint
(mr/def ::graph-edge
  [:map
   [:from_type [:enum :table :transform]]
   [:from_id ms/PositiveInt]
   [:to_type [:enum :table :transform]]
   [:to_id ms/PositiveInt]])

;; Transform execution result
(mr/def ::transform-result
  [:map
   [:type [:= :transform]]
   [:id ms/PositiveInt]])

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

(def CreateWorkspace
  "Schema for creating a new workspace"
  [:map
   [:name [:string {:min 1}]]
   [:database_id {:optional true} :int]
   [:upstream [:map-of ::entity-grouping [:sequential {:min 1} ms/PositiveInt]]]])

(def UpdateWorkspaceContents
  "Schema for updating workspace contents (adding/removing entities)"
  [:map
   [:upstream
    [:map
     [:added {:optional true} [:map-of ::entity-grouping [:sequential ms/PositiveInt]]]
     [:removed {:optional true} [:map-of ::entity-grouping [:sequential ms/PositiveInt]]]]]])

(def Workspace
  "Schema for workspace response"
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:collection_id :int]
   [:database_id :int]
   [:created_at :any]
   [:updated_at :any]])

(def ExecuteResult
  "Schema for workspace execution result"
  [:map
   [:succeeded [:sequential ::transform-result]]
   [:failed [:sequential ::transform-result]]
   [:not_run [:sequential ::transform-result]]])

(def GraphResult
  "Schema for workspace graph visualization"
  [:map
   [:nodes [:sequential ::graph-node]]
   [:edges [:sequential ::graph-edge]]])

(def PromoteRequest
  "Schema for promoting workspace entities"
  [:map
   [:entities [:map-of ::entity-grouping [:sequential ms/PositiveInt]]]])

(def RequestAddEntities
  "Schema for metabot requesting to add entities"
  [:map
   [:entities [:sequential ::entity-reference]]])

(def RequestAddSourceTables
  "Schema for metabot requesting to add source tables"
  [:map
   [:tables [:sequential [:map [:type [:= :table]] [:id ms/PositiveInt]]]]])

(def ApprovalLink
  "Schema for approval link response"
  [:map
   [:approval_url :string]
   [:request_id ms/PositiveInt]])

(defn- ws->response [ws]
  (select-keys ws [:id :name :collection_id :database_id :created_at :updated_at :archived_at]))

;;; routes

(api.macros/defendpoint :get "/" :- [:map [:items [:sequential Workspace]]]
  "Get a list of all workspaces"
  [_route-params
   _query-params]
  {:items  (->> (t2/select :model/Workspace
                           (cond-> {:order-by [[:created_at :desc]]}
                             (request/limit)  (sql.helpers/limit (request/limit))
                             (request/offset) (sql.helpers/offset (request/offset))))
                (mapv ws->response))
   :limit  (request/limit)
   :offset (request/offset)})

(api.macros/defendpoint :get "/:id" :- Workspace
  "Get a single workspace by ID"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (-> (t2/select-one :model/Workspace :id id)
      api/check-404
      ws->response))

(api.macros/defendpoint :get "/:id/contents"
  :- [:map [:contents [:map-of ::entity-grouping [:sequential ::downstream-entity]]]]
  "Get the contents being edited within a Workspace."
  [{workspace-id :id} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (let [fetch-entities (fn [[entity-type entity-grouping]]
                         (let [t2-model (type->t2-model entity-type)]
                           (when-let [entities (t2/select [t2-model :id :name] :workspace_id workspace-id)]
                             [entity-grouping (for [e entities] (assoc e :type entity-type))])))]
    {:contents (into {} (keep fetch-entities) type->grouping)}))

(api.macros/defendpoint :post "/" :- Workspace
  "Create a new workspace"
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

(api.macros/defendpoint :post "/:id/contents" :- Workspace
  "Update workspace contents by adding or removing entities.
   Has the same error responses as create-workspace (graph-not-closed, contains-uncloneable-entities)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- UpdateWorkspaceContents]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO (Chris 11/21/25) -- implement update contents logic
  (let [upstream (:upstream body)
        _added (:added upstream)
        _removed (:removed upstream)]
    (-> (t2/select-one :model/Workspace :id id)
        ws->response)))

(api.macros/defendpoint :post "/:id/execute" :- ExecuteResult
  "Execute all transforms in the workspace in dependency order.
   Returns which transforms succeeded, failed, and were not run."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO (Chris 11/21/25) -- implement execution logic
  {:succeeded []
   :failed []
   :not_run []})

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

(api.macros/defendpoint :post "/:id/promote" :- [:map [:ok [:= true]]]
  "Promote workspace entities to update their live counterparts.
   Checks that promoting won't break any downstream dependents."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- PromoteRequest]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO (Chris 11/21/25) -- implement promote logic
  (let [_entities (:entities body)]
    {:ok true}))

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

(api.macros/defendpoint :post "/:id/request/add-entities" :- ApprovalLink
  "Request to add entities to a workspace (used by metabot).
   Returns an approval link for the workspace owner to approve the request.
   Can return graph-not-closed or contains-uncloneable-entities errors."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- RequestAddEntities]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO (Chris 11/21/25) -- implement request logic
  (let [_entities (:entities body)]
    {:approval_url "https://metabase.example.com/workspace/approve/123"
     :request_id 123}))

(api.macros/defendpoint :post "/:id/request/add-source-tables" :- ApprovalLink
  "Request to add source tables to a workspace (used by metabot).
   Source tables are input tables that entities in the workspace can query.
   Returns an approval link for the workspace owner."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- RequestAddSourceTables]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO (Chris 11/21/25) -- implement request logic
  (let [_tables (:tables body)]
    {:approval_url "https://metabase.example.com/workspace/approve/124"
     :request_id 124}))

(api.macros/defendpoint :post "/:id/approval/:request-id/entity" :- [:map [:ok [:= true]]]
  "Approve a metabot request to add entities to a workspace."
  [{:keys [id request-id]} :- [:map [:id ms/PositiveInt] [:request-id ms/PositiveInt]]
   _query-params
   _body-params]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO (Chris 11/21/25) -- implement approval logic and check request exists
  (let [_request-id request-id]
    {:ok true}))

(api.macros/defendpoint :post "/:id/approval/:request-id/source-table" :- [:map [:ok [:= true]]]
  "Approve a metabot request to add source tables to a workspace."
  [{:keys [id request-id]} :- [:map [:id ms/PositiveInt] [:request-id ms/PositiveInt]]
   _query-params
   _body-params]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO (Chris 11/21/25) -- implement approval logic and check request exists
  (let [_request-id request-id]
    {:ok true}))

(api.macros/defendpoint :get "/mapping/transform/:id/upstream"
  :- [:map
      [:transform [:maybe [:map
                           [:id ms/PositiveInt]
                           [:name :string]]]]]
  "Get the upstream transform for a transform that is in a workspace.
   Returns null if this transform has no upstream mapping (i.e., it's not a mirrored transform)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (let [upstream-id (t2/select-one-fn :upstream_id [:model/WorkspaceMappingTransform :upstream_id] :downstream_id id)]
    (when (nil? upstream-id) (api/check-404 (t2/exists? :model/Workspace id)))
    {:transform (t2/select-one [:model/Transform :id :name] :id upstream-id)}))

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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace/` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
