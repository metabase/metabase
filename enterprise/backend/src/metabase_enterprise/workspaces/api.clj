(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace/` routes"
  (:require
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.request.core :as request]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; schemas

(mr/def ::stuff
  [:string {:min 1 :max 254}])

(def CreateWorkspace
  "Schema for creating a new workspace"
  [:map
   [:name [:string {:min 1}]]
   [:database_id :int]
   [:stuffs [:map-of ::stuff [:sequential ms/PositiveInt]]]])

(def Workspace
  "Schema for workspace response"
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:collection_id :int]
   [:database_id :int]
   [:created_at :any]
   [:updated_at :any]])

(defn- ws->res [ws]
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
                (mapv ws->res))
   :limit  (request/limit)
   :offset (request/offset)})

(api.macros/defendpoint :get "/:id" :- Workspace
  "Get a single workspace by ID"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (-> (t2/select-one :model/Workspace :id id)
      api/check-404
      ws->res))

(api.macros/defendpoint :get "/:id/contents" :- [:map [:contents [:map [:transforms [:sequential ms/PositiveInt]]]]]
  "Get the contents being edited within a Workspace."
  [{workspace-id :id} :- [:map [:id ms/PositiveInt]]
   _query-params]
  {:contents {:transforms (t2/select [:model/Transform :id] :workspace_id workspace-id)}})

(api.macros/defendpoint :post "/" :- Workspace
  "Create a new workspace"
  [_route-params
   _query-params
   post :- CreateWorkspace]
  (-> (ws.common/create-workspace api/*current-user-id* post)
      ws->res))

(api.macros/defendpoint :post "/:id/archive" :- Workspace
  "Update a workspace"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id id))]
    (api/check-400 (nil? (:archived_at ws)) "You cannot archive an archived workspace")
    (t2/update! :model/Workspace id {:archived_at (t/offset-date-time)})
    (-> (t2/select-one :model/Workspace :id id)
        ws->res)))

;; TODO: no removal yet
;; (api.macros/defendpoint :delete "/:id"
;;   "Delete a workspace"
;;   [{:keys [id]} :- [:map [:id ms/PositiveInt]]
;;    _query-params]
;;   (api/check-404 (t2/select-one :model/Workspace :id id))
;;   (t2/delete! :model/Workspace :id id)
;;   api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace/` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
