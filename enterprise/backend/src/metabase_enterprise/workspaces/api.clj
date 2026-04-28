(ns metabase-enterprise.workspaces.api
  "Thin HTTP API for workspaces. Validation, auth, and presentation only —
   all logic lives in [[metabase-enterprise.workspaces.core]]."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private WorkspaceStatus
  [:enum "unprovisioned" "provisioning" "provisioned" "unprovisioning"])

(def ^:private WorkspaceDatabaseParams
  [:map
   [:database_id   ms/PositiveInt]
   [:input_schemas [:sequential ms/NonBlankString]]])

(def ^:private WorkspaceParams
  [:map {:closed true}
   [:name      ms/NonBlankString]
   [:databases [:sequential WorkspaceDatabaseParams]]])

(def ^:private WorkspaceDatabaseResponse
  [:map
   [:database_id      ms/PositiveInt]
   [:database_details :map]
   [:output_schema    :string]
   [:input_schemas    [:sequential ms/NonBlankString]]
   [:status           WorkspaceStatus]])

(def ^:private CreatorResponse
  [:map
   [:id         ms/PositiveInt]
   [:first_name [:maybe :string]]
   [:last_name  [:maybe :string]]
   [:email      ms/NonBlankString]
   [:common_name {:optional true} [:maybe :string]]])

(def ^:private Timestamp
  [:or
   (ms/InstanceOfClass java.time.OffsetDateTime)
   (ms/InstanceOfClass java.time.ZonedDateTime)])

(def ^:private WorkspaceResponse
  [:map
   [:id         ms/PositiveInt]
   [:name       ms/NonBlankString]
   [:creator    [:maybe CreatorResponse]]
   [:created_at Timestamp]
   [:updated_at Timestamp]
   [:databases  [:sequential WorkspaceDatabaseResponse]]])

;;; -------------------------------------------- Presentation --------------------------------------------------

(defn- present-workspace-database [wsd]
  (-> (select-keys wsd [:database_id :database_details :output_schema :input_schemas :status])
      (update :status name)))

(defn- present-creator [creator]
  (when creator
    (select-keys creator [:id :first_name :last_name :email :common_name])))

(defn- present-workspace [workspace]
  (some-> workspace
          (select-keys [:id :name :creator :created_at :updated_at :databases])
          (update :creator present-creator)
          (update :databases #(mapv present-workspace-database %))))

(defn- sanitize-database-params [wsd]
  (select-keys wsd [:database_id :input_schemas]))

(defn- sanitize-workspace-params [params]
  (update params :databases #(mapv sanitize-database-params %)))

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/" :- [:sequential WorkspaceResponse]
  "List all Workspaces."
  []
  (api/check-superuser)
  (mapv present-workspace (ws/list-workspaces)))

(api.macros/defendpoint :get "/:id" :- WorkspaceResponse
  "Get a single Workspace by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (present-workspace (api/check-404 (ws/get-workspace id))))

(api.macros/defendpoint :post "/" :- WorkspaceResponse
  "Create a new Workspace."
  [_route-params _query-params params :- WorkspaceParams]
  (api/check-superuser)
  (present-workspace
   (ws/create-workspace!
    (assoc (sanitize-workspace-params params)
           :creator_id api/*current-user-id*))))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update an existing Workspace. Only allowed when all databases are unprovisioned."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- WorkspaceParams]
  (api/check-superuser)
  (present-workspace (ws/update-workspace! id (sanitize-workspace-params params))))

(api.macros/defendpoint :delete "/:id"
  :- [:map [:id ms/PositiveInt] [:deleted :boolean]]
  "Delete a Workspace. All databases must be unprovisioned."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (ws/delete-workspace! id)
  {:id id :deleted true})

(api.macros/defendpoint :post "/:id/add-database" :- WorkspaceResponse
  "Add a database to a Workspace. Requires at least one input schema."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [database_id input_schemas]} :- [:map
                                           [:database_id   ms/PositiveInt]
                                           [:input_schemas [:sequential {:min 1} ms/NonBlankString]]]]
  (api/check-superuser)
  (present-workspace (ws/add-database! id database_id :input_schemas input_schemas)))

(api.macros/defendpoint :post "/:id/remove-database" :- WorkspaceResponse
  "Remove a database from a Workspace. Only allowed when all databases are unprovisioned."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [database_id]} :- [:map [:database_id ms/PositiveInt]]]
  (api/check-superuser)
  (present-workspace (ws/remove-database! id database_id)))

(api.macros/defendpoint :post "/:id/provision"
  :- [:map [:workspace_id ms/PositiveInt] [:triggered ms/IntGreaterThanOrEqualToZero]]
  "Provision all unprovisioned databases. Can retry after partial failure."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  {:workspace_id id :triggered (ws/provision! id)})

(api.macros/defendpoint :post "/:id/unprovision"
  :- [:map [:workspace_id ms/PositiveInt] [:triggered ms/IntGreaterThanOrEqualToZero]]
  "Unprovision all provisioned databases."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  {:workspace_id id :triggered (ws/unprovision! id)})

(api.macros/defendpoint :get "/remappings"
  "Return all table remappings."
  []
  (api/check-superuser)
  (ws/list-remappings))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes"
  (api.macros/ns-handler *ns* +auth))
