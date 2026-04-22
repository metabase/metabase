(ns metabase-enterprise.workspaces.api
  (:require
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

(def ^:private WorkspaceStatus
  [:enum "uninitialized" "initialized"])

(def ^:private WorkspaceDatabaseParams
  [:map {:closed true}
   [:database_id                  ms/PositiveInt]
   [:database_details             :map]
   [:output_schema                ms/NonBlankString]
   [:input_schemas                [:sequential ms/NonBlankString]]
   [:status          {:optional true} WorkspaceStatus]])

(def ^:private WorkspaceParams
  [:map {:closed true}
   [:name      ms/NonBlankString]
   [:databases [:sequential WorkspaceDatabaseParams]]])

(def ^:private WorkspaceDatabaseResponse
  [:map
   [:database_id      ms/PositiveInt]
   [:database_details :map]
   [:output_schema    ms/NonBlankString]
   [:input_schemas    [:sequential ms/NonBlankString]]
   [:status           WorkspaceStatus]])

(def ^:private WorkspaceResponse
  [:map
   [:id        ms/PositiveInt]
   [:name      ms/NonBlankString]
   [:databases [:sequential WorkspaceDatabaseResponse]]])

(defn- present-workspace-database [wsd]
  (-> wsd
      (select-keys [:database_id :database_details :output_schema :input_schemas :status])
      (update :status name)))

(defn- present-workspace [ws]
  (some-> ws
          (select-keys [:id :name :databases])
          (update :databases #(mapv present-workspace-database %))))

(api.macros/defendpoint :get "/" :- [:sequential WorkspaceResponse]
  "List all Workspaces with their databases."
  []
  (api/check-superuser)
  (mapv present-workspace (workspace/list-workspaces)))

(api.macros/defendpoint :get "/:id" :- WorkspaceResponse
  "Get a single Workspace by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (present-workspace (api/check-404 (workspace/get-workspace id))))

(api.macros/defendpoint :post "/" :- WorkspaceResponse
  "Create a new Workspace."
  [_route-params
   _query-params
   params :- WorkspaceParams]
  (api/check-superuser)
  (present-workspace (workspace/create-workspace! params)))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update an existing Workspace. The supplied `:databases` list fully replaces the existing set."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- WorkspaceParams]
  (api/check-superuser)
  (api/check-404 (workspace/get-workspace id))
  (present-workspace (workspace/update-workspace! id params)))

(api.macros/defendpoint :post "/:id/initialize"
  :- [:map [:workspace_id ms/PositiveInt] [:triggered ms/IntGreaterThanOrEqualToZero]]
  "Kick off asynchronous provisioning for every uninitialized WorkspaceDatabase under
  this Workspace. Returns immediately with the number of rows that were scheduled."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (workspace/get-workspace id))
  {:workspace_id id
   :triggered    (provisioning/initialize-workspace! id)})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes"
  (api.macros/ns-handler *ns* +auth))
