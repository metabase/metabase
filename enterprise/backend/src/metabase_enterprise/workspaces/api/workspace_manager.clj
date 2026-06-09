(ns metabase-enterprise.workspaces.api.workspace-manager
  "EE API endpoints for managing workspaces, served under `/api/ee/workspace-manager`.
   Validation and presentation only — domain logic lives in
   [[metabase-enterprise.workspaces.core]] and permission predicates live on
   `:model/Workspace` and `:model/WorkspaceDatabase` (see `mi/can-read?`/`can-write?`/`can-create?`)."
  (:require
   [medley.core :as m]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.schema :as serialization.schema]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.deployment :as deployment]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.server.streaming-response :as sr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment serialization.schema/keep-me)

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private WorkspaceStatus
  [:enum {:decode/api keyword}
   :unprovisioned :provisioning :provisioned :deprovisioning])

(def ^:private AddDatabaseParams
  [:map {:closed true}
   [:database_id   ::lib.schema.id/database]
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
  [:map {:closed true}
   [:database_id      ::lib.schema.id/database]
   [:input_schemas    [:sequential ms/NonBlankString]]
   [:output_namespace :string]
   [:status           WorkspaceStatus]])

(def ^:private CreatorResponse
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:first_name  [:maybe :string]]
   [:last_name   [:maybe :string]]
   [:email       ms/NonBlankString]
   [:common_name {:optional true} [:maybe :string]]])

(def ^:private DateTimeWithTimeZone
  "An instant with explicit time-zone info. `Timestamp` would be ambiguous --
   `TIMESTAMP` in most SQL databases is short for `TIMESTAMP WITHOUT TIME ZONE`."
  [:or
   (ms/InstanceOfClass java.time.OffsetDateTime)
   (ms/InstanceOfClass java.time.ZonedDateTime)])

(def ^:private WorkspaceResponse
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:name        ms/NonBlankString]
   [:creator     [:maybe CreatorResponse]]
   [:created_at  DateTimeWithTimeZone]
   [:updated_at  DateTimeWithTimeZone]
   ;; `:databases` is only included when hydrated (i.e. the GET /:id endpoint).
   ;; The list endpoint omits it — clients should treat a missing array as `[]`.
   [:databases   {:optional true} [:sequential WorkspaceDatabaseResponse]]])

;;; ------------------------------------------ Instance-pool schemas -------------------------------------------

;; `workspace_id` is rejected explicitly (see `reject-workspace-id!`) rather than via a
;; `:closed true` map, so the FE can't bind an instance to a workspace by editing the row.
;; Binding happens only via the `:deployment` (provision) endpoint.
(def ^:private CreateInstanceParams
  [:map
   [:url     ms/NonBlankString]
   [:api_key ms/NonBlankString]
   [:name    {:optional true} [:maybe :string]]])

(def ^:private UpdateInstanceParams
  [:map
   [:url     {:optional true} ms/NonBlankString]
   [:api_key {:optional true} ms/NonBlankString]
   [:name    {:optional true} [:maybe :string]]])

(def ^:private InstanceResponse
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:url          ms/NonBlankString]
   [:name         [:maybe :string]]
   ;; `status` is derived from `workspace_id`, never stored.
   [:status       [:enum :free :provisioned]]
   [:workspace_id [:maybe ms/PositiveInt]]
   [:created_at   DateTimeWithTimeZone]
   [:updated_at   DateTimeWithTimeZone]])

;;; -------------------------------------------- Presentation --------------------------------------------------

(defn- present-workspace-database [wsd]
  (select-keys wsd [:database_id :input_schemas :output_namespace :status]))

(defn- present-creator [creator]
  (when creator
    (select-keys creator [:id :first_name :last_name :email :common_name])))

(defn- present-workspace [workspace]
  (some-> workspace
          (select-keys [:id :name :creator :created_at :updated_at :databases])
          (update :creator present-creator)
          (m/update-existing :databases #(mapv present-workspace-database %))))

(defn- present-instance
  "Shape a `workspace_instance` row for the API: derive `status` and drop the encrypted
   `api_key` so it never leaves the server."
  [{:keys [workspace_id] :as instance}]
  (-> instance
      (select-keys [:id :url :name :workspace_id :created_at :updated_at])
      (dissoc :api_key)
      (assoc :status (if workspace_id :provisioned :free))))

(defn- reject-workspace-id!
  "An instance is bound to a workspace only by the `:deployment` endpoint. Refuse (400)
   any attempt to set `workspace_id` directly through CRUD."
  [params]
  (when (contains? params :workspace_id)
    (throw (ex-info "workspace_id cannot be set via this endpoint; use the provision endpoint."
                    {:status-code 400}))))

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/" :- [:sequential WorkspaceResponse]
  "List all Workspaces."
  []
  ;; Top-level gate: only Data Analysts (and admins) may list. We then apply `mi/can-read?` per row
  ;; for defense in depth — if `can-read?` ever grows tighter rules, the listing will narrow with it
  ;; instead of leaking rows that the per-row check would refuse.
  (api/check-data-analyst)
  (into [] (comp (filter mi/can-read?)
                 (map present-workspace))
        (ws/list-workspaces)))

(api.macros/defendpoint :get "/:id" :- WorkspaceResponse
  "Get a single Workspace by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/read-check :model/Workspace id)
  (present-workspace (api/check-404 (ws/get-workspace id))))

(api.macros/defendpoint :post "/" :- WorkspaceResponse
  "Create a new Workspace (name only, no databases)."
  [_route-params _query-params params :- CreateWorkspaceParams]
  (api/create-check :model/Workspace params)
  (present-workspace
   (ws/create-workspace!
    (assoc params :creator_id api/*current-user-id*))))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update a workspace's name."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- UpdateWorkspaceParams]
  (api/write-check :model/Workspace id)
  (when (:name params)
    (t2/update! :model/Workspace :id id {:name (:name params)}))
  (present-workspace (api/check-404 (ws/get-workspace id))))

(api.macros/defendpoint :delete "/:id"
  :- [:map [:id ms/PositiveInt] [:deleted :boolean]]
  "Delete a Workspace. Deprovisions all databases first (blocking)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/write-check :model/Workspace id)
  (ws/delete-workspace! id)
  {:id id :deleted true})

;;; ---------------------------------------- Database sub-endpoints --------------------------------------------

(api.macros/defendpoint :post "/:id/database" :- WorkspaceResponse
  "Add a database to a workspace and provision it immediately (blocking)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- AddDatabaseParams]
  (api/create-check :model/WorkspaceDatabase params)
  (present-workspace
   (ws/add-database! id (:database_id params) (:input_schemas params))))

(api.macros/defendpoint :put "/:id/database/:db-id" :- WorkspaceResponse
  "Update a database's input namespaces. Deprovisions the old config and reprovisions
   with the new one (blocking)."
  [{:keys [id db-id]} :- [:map [:id ms/PositiveInt] [:db-id ms/PositiveInt]]
   _query-params
   params :- UpdateDatabaseParams]
  (api/write-check (api/check-404 (t2/select-one :model/WorkspaceDatabase
                                                 :workspace_id id
                                                 :database_id db-id)))
  (present-workspace
   (ws/update-database! id db-id (:input_schemas params))))

(api.macros/defendpoint :delete "/:id/database/:db-id"
  :- WorkspaceResponse
  "Deprovision and remove a database from a workspace (blocking)."
  [{:keys [id db-id]} :- [:map [:id ms/PositiveInt] [:db-id ms/PositiveInt]]]
  (api/write-check (api/check-404 (t2/select-one :model/WorkspaceDatabase
                                                 :workspace_id id
                                                 :database_id db-id)))
  (present-workspace
   (ws/remove-database! id db-id)))

;;; ------------------------------------------- Config download --------------------------------------------------

(api.macros/defendpoint :get "/:id/config"
  :- [:map
      [:status  [:= 200]]
      [:headers [:map-of :string :string]]
      [:body    :string]]
  "Download the workspace's developer-instance config as a YAML file. 409 if any
  of the workspace's databases is not `:provisioned`."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/write-check :model/Workspace id)
  (let [config (api/check-404 (ws.config/build-workspace-config id))]
    {:status  200
     :headers {"Content-Type"        "application/x-yaml"
               "Content-Disposition" "attachment; filename=\"config.yml\""}
     :body    (ws.config/config->yaml config)}))

;;; ----------------------------------------- Metadata export --------------------------------------------------

(defn- workspace-metadata-filters
  "Derive the `:database-ids` and `:schema-ids` filter values from a hydrated workspace.
   `:schema-ids` is a `{db-id [\"schema\" ...]}` map matching the metadata export schema."
  [{:keys [databases]}]
  {:database-ids (mapv :database_id databases)
   :schema-ids   (into {}
                       (map (fn [{:keys [database_id input_schemas]}]
                              [database_id (vec input_schemas)]))
                       databases)})

(api.macros/defendpoint :get "/:id/metadata/export"
  :- (sr/streaming-response-schema ::serialization.schema/export-metadata-response)
  "Stream the warehouse metadata (databases, tables, fields) for the workspace's databases,
  scoped to each database's `:input` namespaces. Same flag semantics as
  `/api/ee/serialization/metadata/export` — sections must be opted into via the
  `with-databases` / `with-tables` / `with-fields` query parameters."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   query-params
   :- [:map
       [:with-databases {:default false} [:maybe :boolean]]
       [:with-tables    {:default false} [:maybe :boolean]]
       [:with-fields    {:default false} [:maybe :boolean]]]]
  (api/read-check :model/Workspace id)
  (let [workspace (api/check-404 (ws/get-workspace id))
        opts      (merge query-params
                         (workspace-metadata-filters workspace)
                         {:user-info {:user-id       api/*current-user-id*
                                      :is-superuser? api/*is-superuser?*}})]
    (sr/streaming-response {:content-type "application/json; charset=utf-8"} [os _]
      (serialization/export-metadata! os opts))))

;;; ------------------------------------------- Instance pool CRUD ---------------------------------------------
;;;
;;; The pool registry of pre-booted dev (child) instances. Superuser-gated.
;;; `workspace_id` is set only by the `:deployment` endpoints, never here.

(api.macros/defendpoint :get "/instance" :- [:sequential InstanceResponse]
  "List all registered dev instances in the pool."
  []
  (api/check-superuser)
  (mapv present-instance (t2/select :model/WorkspaceInstance {:order-by [[:id :asc]]})))

(api.macros/defendpoint :get "/instance/:id" :- InstanceResponse
  "Get a single pool instance by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (present-instance (api/check-404 (t2/select-one :model/WorkspaceInstance :id id))))

(def ^:private instance-writable-keys [:url :api_key :name])

(api.macros/defendpoint :post "/instance" :- InstanceResponse
  "Register a new dev instance in the pool. Starts free (unbound)."
  [_route-params _query-params params :- CreateInstanceParams]
  (api/check-superuser)
  (reject-workspace-id! params)
  (let [row (select-keys params instance-writable-keys)]
    (present-instance
     (t2/select-one :model/WorkspaceInstance
                    :id (t2/insert-returning-pk! :model/WorkspaceInstance row)))))

(api.macros/defendpoint :put "/instance/:id" :- InstanceResponse
  "Update a pool instance's `url`, `api_key`, or `name`. Cannot change `workspace_id`."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- UpdateInstanceParams]
  (api/check-superuser)
  (reject-workspace-id! params)
  (api/check-404 (t2/select-one :model/WorkspaceInstance :id id))
  (let [row (select-keys params instance-writable-keys)]
    (when (seq row)
      (t2/update! :model/WorkspaceInstance :id id row)))
  (present-instance (t2/select-one :model/WorkspaceInstance :id id)))

(api.macros/defendpoint :delete "/instance/:id"
  :- [:map [:id ms/PositiveInt] [:deleted :boolean]]
  "Remove a pool instance. 409 if it is currently provisioned — deprovision first."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [{:keys [workspace_id]} (api/check-404 (t2/select-one :model/WorkspaceInstance :id id))]
    (when workspace_id
      (throw (ex-info "Cannot delete a provisioned instance; deprovision it first."
                      {:status-code 409 :workspace_id workspace_id})))
    (t2/delete! :model/WorkspaceInstance :id id)
    {:id id :deleted true}))

;;; --------------------------------------- Deployment (provision / deprovision) ------------------------------
;;;
;;; Bind a workspace to a free pool instance (and back). `:id` here is the *workspace* id.

(def ^:private RemoteSyncParams
  [:map {:closed true}
   [:url    ms/NonBlankString]
   [:token  ms/NonBlankString]
   [:branch {:optional true} ms/NonBlankString]])

(api.macros/defendpoint :post "/:id/deployment" :- InstanceResponse
  "Provision workspace `:id` onto a free pool instance. Body
   `{workspace_instance_id, remote_sync?}`. Takes the instance from the pool, builds the
   workspace config.yml, binds it on the child over HTTP, and marks the instance
   provisioned. 409 if the instance is busy or the workspace has un-provisioned databases.

   When `remote_sync` `{url, token, branch?}` is supplied, also configures remote-sync on
   the child and triggers the initial content import."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [workspace_instance_id remote_sync]}
   :- [:map
       [:workspace_instance_id ms/PositiveInt]
       [:remote_sync {:optional true} RemoteSyncParams]]]
  (api/check-superuser)
  (present-instance
   (deployment/provision! id workspace_instance_id
                          (when remote_sync
                            {:url    (:url remote_sync)
                             :token  (:token remote_sync)
                             :branch (:branch remote_sync)}))))

(api.macros/defendpoint :delete "/:id/deployment/:workspace-instance-id" :- InstanceResponse
  "Deprovision workspace `:id`: unbind it from pool instance `:workspace-instance-id` and
   return that instance to the pool (free). The instance is not destroyed. 409 if the named
   instance is not the one bound to this workspace."
  [{:keys [id workspace-instance-id]}
   :- [:map [:id ms/PositiveInt] [:workspace-instance-id ms/PositiveInt]]]
  (api/check-superuser)
  (present-instance (deployment/deprovision! id workspace-instance-id)))
