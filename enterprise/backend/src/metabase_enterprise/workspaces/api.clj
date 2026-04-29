(ns metabase-enterprise.workspaces.api
  "Thin HTTP API for workspaces. Validation, auth, and presentation only —
   all logic lives in [[metabase-enterprise.workspaces.core]]."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.scope :as ws.scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]
   [oidc-provider.core :as oidc]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private WorkspaceStatus
  [:enum "unprovisioned" "provisioning" "provisioned" "deprovisioning"])

(def ^:private AddDatabaseParams
  [:map {:closed true}
   [:database_id   ms/PositiveInt]
   [:input_schemas [:sequential ms/NonBlankString]]])

(def ^:private UpdateDatabaseParams
  [:map {:closed true}
   [:input_schemas [:sequential ms/NonBlankString]]])

(def ^:private CreateWorkspaceParams
  [:map {:closed true}
   [:name ms/NonBlankString]])

(def ^:private UpdateWorkspaceParams
  [:map {:closed true}
   [:name {:optional true} ms/NonBlankString]])

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
  "Create a new Workspace (name only, no databases)."
  [_route-params _query-params params :- CreateWorkspaceParams]
  (api/check-superuser)
  (present-workspace
   (ws/create-workspace!
    (assoc params :creator_id api/*current-user-id*))))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update a workspace's name."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- UpdateWorkspaceParams]
  (api/check-superuser)
  ;; For now just name updates — structural changes go through the database sub-endpoints
  (when (:name params)
    (t2/update! :model/Workspace :id id {:name (:name params)}))
  (present-workspace (api/check-404 (ws/get-workspace id))))

(api.macros/defendpoint :delete "/:id"
  :- [:map [:id ms/PositiveInt] [:deleted :boolean]]
  "Delete a Workspace. Deprovisions all databases first (blocking)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (ws/delete-workspace! id)
  {:id id :deleted true})

;;; ---------------------------------------- Database sub-endpoints --------------------------------------------

(api.macros/defendpoint :post "/:id/database" :- WorkspaceResponse
  "Add a database to a workspace and provision it immediately (blocking)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- AddDatabaseParams]
  (api/check-superuser)
  (present-workspace
   (ws/add-database! id (:database_id params) (:input_schemas params))))

(api.macros/defendpoint :put "/:id/database/:db-id" :- WorkspaceResponse
  "Update a database's input schemas. Deprovisions the old config and reprovisions
   with the new one (blocking)."
  [{:keys [id db-id]} :- [:map [:id ms/PositiveInt] [:db-id ms/PositiveInt]]
   _query-params
   params :- UpdateDatabaseParams]
  (api/check-superuser)
  (present-workspace
   (ws/update-database! id db-id (:input_schemas params))))

(api.macros/defendpoint :delete "/:id/database/:db-id"
  :- WorkspaceResponse
  "Deprovision and remove a database from a workspace (blocking)."
  [{:keys [id db-id]} :- [:map [:id ms/PositiveInt] [:db-id ms/PositiveInt]]]
  (api/check-superuser)
  (present-workspace
   (ws/remove-database! id db-id)))

;;; ------------------------------------------- Read-only endpoints --------------------------------------------

(api.macros/defendpoint :get "/remappings"
  "Return all table remappings."
  []
  (api/check-superuser)
  (ws/list-remappings))

(def ^:private WorkspaceInstanceDatabase
  [:map
   [:name          ms/NonBlankString]
   [:input_schemas [:sequential ms/NonBlankString]]
   [:output_schema :string]])

(def ^:private WorkspaceInstance
  [:map
   [:name             ms/NonBlankString]
   [:databases        [:map-of ms/PositiveInt WorkspaceInstanceDatabase]]
   [:remappings_count ms/IntGreaterThanOrEqualToZero]])

(api.macros/defendpoint :get "/current" :- [:maybe WorkspaceInstance]
  "Read-only summary of the workspace loaded on this (child) instance."
  []
  (api/check-superuser)
  (when-let [workspace (->> (ws/list-workspaces)
                            (sort-by :created_at)
                            reverse
                            (some (fn [w] (when (seq (:databases w)) w))))]
    (let [db-ids    (mapv :database_id (:databases workspace))
          dbs-by-id (when (seq db-ids)
                      (into {} (map (juxt :id identity))
                            (t2/select [:model/Database :id :name] :id [:in db-ids])))]
      {:name             (:name workspace)
       :remappings_count (count (ws/list-remappings))
       :databases        (into {}
                               (map (fn [wsd]
                                      [(:database_id wsd)
                                       {:name          (get-in dbs-by-id [(:database_id wsd) :name] "")
                                        :input_schemas (vec (:input_schemas wsd))
                                        :output_schema (or (:output_schema wsd) "")}]))
                               (:databases workspace))})))

(api.macros/defendpoint :get "/:id/config/yaml"
  :- [:map
      [:status  [:= 200]]
      [:headers [:map-of :string :string]]
      [:body    :string]]
  "Download the workspace's developer-instance config as a YAML file."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [workspace (api/check-404 (ws/get-workspace id))]
    {:status  200
     :headers {"Content-Type"        "application/x-yaml"
               "Content-Disposition" "attachment; filename=\"config.yml\""}
     :body    (yaml/generate-string
               {:name (:name workspace)})}))

;;; ------------------------------------------ Token management --------------------------------------------------

(defn- workspace-resource-uri [workspace-id]
  (str "urn:metabase:workspace:" workspace-id))

(def ^:private workspace-scopes
  [ws.scope/workspace-config-read
   ws.scope/workspace-metadata-read])

(api.macros/defendpoint :post "/:id/token"
  "Create an OAuth access token for external access to this workspace.
   The token is scoped to workspace:config:read and workspace:metadata:read.
   Returns the plaintext tokens — store them securely, they cannot be retrieved again."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (ws/get-workspace id))
  (let [provider    (oauth-server/get-provider)
        ;; Register a dedicated OAuth client for this workspace
        client-config {:redirect-uris  ["http://127.0.0.1/callback"]
                       :grant-types    ["authorization_code" "refresh_token"]
                       :response-types ["code"]
                       :scopes         workspace-scopes
                       :client-name    (str "workspace-" id "-token")}
        registered  (oidc/register-client provider client-config)
        client-id   (:client-id registered)
        resource    [(workspace-resource-uri id)]
        tokens      (oauth-server/mint-tokens! api/*current-user-id* client-id
                                               workspace-scopes resource)]
    {:workspace_id  id
     :client_id     client-id
     :access_token  (:access-token tokens)
     :refresh_token (:refresh-token tokens)
     :expires_in    (:expires-in tokens)
     :scopes        workspace-scopes
     :resource      (workspace-resource-uri id)}))

(api.macros/defendpoint :delete "/:id/token"
  "Revoke all OAuth tokens associated with this workspace and delete the OAuth clients."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (ws/get-workspace id))
  ;; Find and delete all OAuth clients named for this workspace
  (let [client-name-prefix (str "workspace-" id "-token")]
    (doseq [client (t2/select :model/OAuthClient :client_name client-name-prefix)]
      ;; Revoke all access tokens for this client
      (t2/update! :model/OAuthAccessToken {:client_id (:client_id client)} {:revoked_at :%now})
      ;; Revoke all refresh tokens for this client
      (t2/update! :model/OAuthRefreshToken {:client_id (:client_id client)} {:revoked_at :%now})
      ;; Delete the client
      (t2/delete! :model/OAuthClient :client_id (:client_id client))))
  {:workspace_id id :revoked true})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes"
  (api.macros/ns-handler *ns* +auth))
