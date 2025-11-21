(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace/` routes"
  (:require
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
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

(def CreateWorkspace
  "Schema for creating a new workspace"
  [:map
   [:name [:string {:min 1}]]
   [:database_id {:optional true} :int]
   [:upstream [:map-of ::entity-grouping [:sequential {:min 1} ms/PositiveInt]]]])

(def Workspace
  "Schema for workspace response"
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:collection_id :int]
   [:database_id :int]
   [:created_at :any]
   [:updated_at :any]])

(defn- ws->response [ws]
  (select-keys ws [:id :name :collection_id :database_id :created_at :updated_at :archived_at]))

;;; routes

(api.macros/defendpoint :get "/" :- [:map [:items [:sequential Workspace]]]
  "Get a list of all workspaces"
  [_route-params
   _query-params]
  {:items  (->> (t2/select :model/Workspace :archived_at [:is nil]
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
  "Update a workspace"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id id))]
    (api/check-400 (nil? (:archived_at ws)) "You cannot archive an archived workspace")
    (t2/update! :model/Workspace id {:archived_at [:now]})
    (-> (t2/select-one :model/Workspace :id id)
        ws->response)))

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

(api.macros/defendpoint :post "/:id/merge"
  :- [:map
      [:promoted [:sequential [:map [:id ms/PositiveInt] [:name :string]]]]
      [:errors {:optional true} [:sequential [:map [:id ms/PositiveInt] [:name :string] [:error :string]]]]
      [:workspace [:map [:id ms/PositiveInt] [:name :string]]]
      [:archived-at :any]]
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
    {:promoted    (vec promoted)
     :errors      errors
     :workspace   {:id id :name (:name ws)}
     :archived_at (when-not (seq errors)
                    (t2/update! :model/Workspace :id id {:archived_at (t/offset-date-time)})
                    (t2/select-one-fn :archived_at [:model/Workspace :archived_at] :id id))}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace/` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
