(ns metabase-enterprise.workspaces.api.workspace-manager
  "EE API endpoints for managing workspaces, served under `/api/ee/workspace-manager`.
   Validation and presentation only — domain logic lives in
   [[metabase-enterprise.workspaces.core]] and permission predicates live on
   `:model/Workspace` and `:model/WorkspaceDatabase` (see `mi/can-read?`/`can-write?`/`can-create?`)."
  (:require
   [medley.core :as m]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private WorkspaceStatus
  [:enum {:decode/api keyword}
   :unprovisioned :provisioning :provisioned :deprovisioning])

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
   [:status           WorkspaceStatus]
   [:database         {:optional true} [:maybe :map]]])

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

;;; ------------------------------------------ Instance schemas ------------------------------------------------

(def ^:private CreateInstanceParams
  [:map {:closed true}
   [:url     ms/NonBlankString]
   [:api_key ms/NonBlankString]
   [:name    {:optional true} [:maybe :string]]])

(def ^:private UpdateInstanceParams
  [:map {:closed true}
   [:name {:optional true} [:maybe :string]]])

(def ^:private InstanceResponse
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:url          ms/NonBlankString]
   [:name         [:maybe :string]]
   [:workspace_id [:maybe ms/PositiveInt]]
   [:created_at   DateTimeWithTimeZone]
   [:updated_at   DateTimeWithTimeZone]])

;;; -------------------------------------------- Presentation --------------------------------------------------

(defn- present-workspace-database [wsd]
  (-> wsd
      (select-keys [:database_id :input_schemas :output_namespace :status :database])
      ;; never expose connection credentials
      (m/update-existing :database #(some-> % (dissoc :details)))))

(defn- present-creator [creator]
  (when creator
    (select-keys creator [:id :first_name :last_name :email :common_name])))

(defn- present-workspace [workspace]
  (some-> workspace
          (select-keys [:id :name :creator :created_at :updated_at :databases])
          (update :creator present-creator)
          (m/update-existing :databases #(mapv present-workspace-database %))))

(defn- present-instance
  "Shape a `workspace_instance` row for the API: drop the encrypted `api_key`."
  [instance]
  (select-keys instance [:id :url :name :workspace_id :created_at :updated_at]))

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/" :- [:sequential WorkspaceResponse]
  "List all Workspaces."
  []
  (api/check-superuser)
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

;;; ------------------------------------------- Instance CRUD --------------------------------------------------
;;;
;;; The registry of dev (child) instances. Superuser-only via the
;;; `:model/WorkspaceInstance` permission predicates. `workspace_id` is never set
;;; through these endpoints.

(api.macros/defendpoint :get "/instance" :- [:sequential InstanceResponse]
  "List all registered dev instances."
  []
  (api/check-superuser)
  (into [] (comp (filter mi/can-read?)
                 (map present-instance))
        (t2/select :model/WorkspaceInstance {:order-by [[:id :asc]]})))

(api.macros/defendpoint :get "/instance/:id" :- InstanceResponse
  "Get a single dev instance by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (present-instance (api/read-check :model/WorkspaceInstance id)))

(api.macros/defendpoint :post "/instance" :- InstanceResponse
  "Register a new dev instance. Starts free (unbound)."
  [_route-params _query-params params :- CreateInstanceParams]
  (api/create-check :model/WorkspaceInstance params)
  (present-instance
   (t2/select-one :model/WorkspaceInstance
                  :id (t2/insert-returning-pk! :model/WorkspaceInstance params))))

(api.macros/defendpoint :put "/instance/:id" :- InstanceResponse
  "Rename a dev instance. Only `name` is editable; `url`/`api_key` are immutable."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- UpdateInstanceParams]
  (api/write-check :model/WorkspaceInstance id)
  (let [row (select-keys params [:name])]
    (when (seq row)
      (t2/update! :model/WorkspaceInstance :id id row)))
  (present-instance (t2/select-one :model/WorkspaceInstance :id id)))

(api.macros/defendpoint :delete "/instance/:id"
  :- [:map [:id ms/PositiveInt] [:deleted :boolean]]
  "Remove a dev instance."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/write-check :model/WorkspaceInstance id)
  (t2/delete! :model/WorkspaceInstance :id id)
  {:id id :deleted true})

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
