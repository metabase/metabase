(ns metabase-enterprise.workspaces.api
  (:require
   [metabase-enterprise.workspaces.config :as config]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.table-remapping.model]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment metabase.table-remapping.model/keep-me)

(def ^:private WorkspaceStatus
  [:enum "uninitialized" "initialized"])

(def ^:private WorkspaceDatabaseParams
  [:map
   [:database_id   ms/PositiveInt]
   [:input_schemas [:sequential ms/NonBlankString]]])

(def ^:private WorkspaceParams
  [:map {:closed true}
   [:name      ms/NonBlankString]
   [:databases [:sequential WorkspaceDatabaseParams]]])

(defn- sanitize-workspace-database-params
  "Strip server-controlled fields the client is not allowed to set."
  [wsd]
  (select-keys wsd [:database_id :input_schemas]))

(defn- sanitize-workspace-params [params]
  (update params :databases #(mapv sanitize-workspace-database-params %)))

(def ^:private WorkspaceDatabaseResponse
  [:map
   [:database_id      ms/PositiveInt]
   [:database_details :map]
   [:output_schema    :string]
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

(api.macros/defendpoint :get "/remappings"
  "Return every row in the `table_remapping` table."
  []
  (api/check-superuser)
  (t2/select :model/TableRemapping {:order-by [[:id :asc]]}))

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
  (present-workspace (workspace/create-workspace! (sanitize-workspace-params params))))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update an existing Workspace. The supplied `:databases` list fully replaces the existing set."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- WorkspaceParams]
  (api/check-superuser)
  (api/check-404 (workspace/get-workspace id))
  (present-workspace (workspace/update-workspace! id (sanitize-workspace-params params))))

(api.macros/defendpoint :post "/:id/initialize"
  :- [:map [:workspace_id ms/PositiveInt] [:triggered ms/IntGreaterThanOrEqualToZero]]
  "Kick off asynchronous provisioning for every uninitialized WorkspaceDatabase under
  this Workspace. Returns immediately with the number of rows that were scheduled."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (workspace/get-workspace id))
  {:workspace_id id
   :triggered    (provisioning/initialize-workspace! id)})

(api.macros/defendpoint :post "/:id/deprovision"
  :- [:map [:workspace_id ms/PositiveInt] [:triggered ms/IntGreaterThanOrEqualToZero]]
  "Kick off asynchronous deprovisioning for every initialized WorkspaceDatabase under
  this Workspace. Returns immediately with the number of rows that were scheduled."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (workspace/get-workspace id))
  {:workspace_id id
   :triggered    (provisioning/deprovision-workspace! id)})

(api.macros/defendpoint :delete "/:id"
  :- [:map [:id ms/PositiveInt] [:deleted :boolean]]
  "Delete a Workspace. Returns 409 if any of its databases is still :initialized —
  deprovision first."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (workspace/get-workspace id))
  (workspace/delete-workspace! id)
  {:id id :deleted true})

(api.macros/defendpoint :get "/:id/config"
  "Return a downloadable JSON config fragment for this Workspace. Returns 409 if
  any of the Workspace's databases is still uninitialized."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (config/build-workspace-config id)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes"
  (api.macros/ns-handler *ns* +auth))
