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
   [metabase-enterprise.workspaces.instances :as ws.instances]
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

(def ^:private CreateWorkspaceParams
  [:map {:closed true}
   [:name         ms/NonBlankString]
   [:database_ids [:sequential {:min 1} ::lib.schema.id/database]]
   [:instance_id  {:optional true} [:maybe ms/PositiveInt]]])

(def ^:private UpdateWorkspaceParams
  [:map {:closed true}
   [:name        {:optional true} ms/NonBlankString]
   [:instance_id {:optional true} [:maybe ms/PositiveInt]]])

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

(def ^:private WorkspaceInstanceSummary
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:name           ms/NonBlankString]
   [:url            ms/NonBlankString]
   [:initialized_at [:maybe DateTimeWithTimeZone]]])

(def ^:private WorkspaceResponse
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:name        ms/NonBlankString]
   [:creator     [:maybe CreatorResponse]]
   [:instance    {:optional true} [:maybe WorkspaceInstanceSummary]]
   [:created_at  DateTimeWithTimeZone]
   [:updated_at  DateTimeWithTimeZone]
   ;; `:databases` is only included when hydrated (i.e. the GET /:id endpoint).
   ;; The list endpoint omits it — clients should treat a missing array as `[]`.
   [:databases   {:optional true} [:sequential WorkspaceDatabaseResponse]]])

(def ^:private CreateInstanceParams
  [:map {:closed true}
   [:name    ms/NonBlankString]
   [:url     ms/NonBlankString]
   [:api_key ms/NonBlankString]])

(def ^:private UpdateInstanceParams
  [:map {:closed true}
   [:name    {:optional true} ms/NonBlankString]
   [:url     {:optional true} ms/NonBlankString]
   ;; nil keeps the stored key: the key is never sent back to clients, so edits
   ;; that don't change it can't echo it
   [:api_key {:optional true} [:maybe ms/NonBlankString]]])

(def ^:private TestInstanceConnectionParams
  [:map {:closed true}
   [:id      {:optional true} [:maybe ms/PositiveInt]]
   [:url     {:optional true} [:maybe ms/NonBlankString]]
   [:api_key {:optional true} [:maybe ms/NonBlankString]]])

(def ^:private InstanceResponse
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:name           ms/NonBlankString]
   [:url            ms/NonBlankString]
   [:workspace_id   [:maybe ms/PositiveInt]]
   [:initialized_at [:maybe DateTimeWithTimeZone]]
   [:created_at     DateTimeWithTimeZone]
   [:updated_at     DateTimeWithTimeZone]])

;;; -------------------------------------------- Presentation --------------------------------------------------

(defn- present-workspace-database [wsd]
  (-> wsd
      (select-keys [:database_id :input_schemas :output_namespace :status :database])
      ;; never expose connection credentials
      (m/update-existing :database #(some-> % (dissoc :details)))))

(defn- present-creator [creator]
  (when creator
    (select-keys creator [:id :first_name :last_name :email :common_name])))

(defn- present-instance-summary [instance]
  (when instance
    (select-keys instance [:id :name :url :initialized_at])))

(defn- present-instance
  "Never exposes `:details` — it holds the child's API key."
  [instance]
  (select-keys instance [:id :name :url :workspace_id :initialized_at :created_at :updated_at]))

(defn- present-workspace [workspace]
  (some-> workspace
          (select-keys [:id :name :creator :instance :created_at :updated_at :databases])
          (update :creator present-creator)
          (m/update-existing :instance present-instance-summary)
          (m/update-existing :databases #(mapv present-workspace-database %))))

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
  "Create a new Workspace attached to the given databases (each must be eligible
   for workspaces), provision it (blocking), and assign it to the child instance
   with `instance_id`, if given (404 when the instance doesn't exist — checked
   before any provisioning work). An instance already hosting another workspace
   is re-pointed at the new one."
  [_route-params _query-params params :- CreateWorkspaceParams]
  (api/create-check :model/Workspace params)
  (let [instance-id (:instance_id params)]
    (when instance-id
      (ws.instances/check-instance-exists! instance-id))
    (let [workspace (ws/create-workspace!
                     (-> params
                         (dissoc :instance_id)
                         (assoc :creator_id api/*current-user-id*)))]
      (when instance-id
        (ws.instances/assign-to-workspace! instance-id (:id workspace)))
      (present-workspace (ws/get-workspace (:id workspace))))))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update a workspace's name and/or its assigned child instance (`instance_id`
   nil releases the current instance)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- UpdateWorkspaceParams]
  (api/write-check :model/Workspace id)
  (when (:name params)
    (t2/update! :model/Workspace :id id {:name (:name params)}))
  (when (contains? params :instance_id)
    (ws.instances/assign-to-workspace! (:instance_id params) id))
  (present-workspace (api/check-404 (ws/get-workspace id))))

(api.macros/defendpoint :delete "/:id"
  :- [:map
      [:id ms/PositiveInt]
      [:deleted :boolean]
      [:message {:optional true} :string]
      [:orphaned_resources {:optional true}
       [:sequential [:map
                     [:workspace_database_id ms/PositiveInt]
                     [:database_id ms/PositiveInt]
                     [:driver :keyword]
                     [:schema :string]
                     [:user :string]
                     [:reason {:optional true} [:maybe :string]]]]]]
  "Delete a Workspace. Tears down each `:provisioned` database's warehouse isolation
  first (blocking). Refuses with a 409 if any database is still `:provisioning`/
  `:deprovisioning` unless `ignore_pending=true`, in which case those databases are
  left in the warehouse and only their app-DB rows are removed. If the warehouse was
  unreachable for some `:provisioned` databases, the response includes
  `:orphaned_resources` and a `:message` describing the inert schema/user objects
  left behind for manual cleanup."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {ignore-pending? :ignore-pending} :- [:map [:ignore-pending {:default false} [:maybe ms/BooleanValue]]]]
  (api/write-check :model/Workspace id)
  (assoc (ws/delete-workspace! id (boolean ignore-pending?)) :id id))

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

;;; --------------------------------------- Connected instances ---------------------------------------------------

(api.macros/defendpoint :get "/instance" :- [:sequential InstanceResponse]
  "List all connected child instances."
  []
  (api/check-superuser)
  (mapv present-instance (ws.instances/list-instances)))

(api.macros/defendpoint :post "/instance" :- InstanceResponse
  "Connect a child instance: register its URL and an admin API key created on it.
   The key is stored encrypted and never sent back to clients."
  [_route-params _query-params params :- CreateInstanceParams]
  (api/check-superuser)
  (present-instance (ws.instances/create-instance! params)))

(api.macros/defendpoint :put "/instance/:instance-id" :- InstanceResponse
  "Update a connected child instance's name, URL, and/or API key. Omit `api_key`
   (or send nil) to keep the stored key."
  [{:keys [instance-id]} :- [:map [:instance-id ms/PositiveInt]]
   _query-params
   params :- UpdateInstanceParams]
  (api/write-check :model/WorkspaceInstance instance-id)
  (present-instance (ws.instances/update-instance! instance-id params)))

(api.macros/defendpoint :delete "/instance/:instance-id" :- :nil
  "Disconnect a child instance. Only removes the registration on this instance —
   the child itself is not touched."
  [{:keys [instance-id]} :- [:map [:instance-id ms/PositiveInt]]]
  (api/write-check :model/WorkspaceInstance instance-id)
  (ws.instances/delete-instance! instance-id)
  nil)

(api.macros/defendpoint :post "/instance/test"
  :- [:map
      [:ok      :boolean]
      [:message {:optional true} [:maybe :string]]]
  "Test that a child instance is reachable and its API key authenticates an admin
   there. Pass `url` + `api_key` to check unsaved form values, or `id` to fall
   back to a registered instance's stored credentials for whatever is omitted."
  [_route-params _query-params params :- TestInstanceConnectionParams]
  (api/check-superuser)
  (ws.instances/test-connection params))

(api.macros/defendpoint :post "/:id/push-config" :- InstanceResponse
  "Push the workspace's config to its assigned child instance, WIPING the child's
   existing content and re-initializing it from the config (blocking). 400 when
   the workspace has no assigned instance, 409 when any of its databases is not
   `:provisioned`, 502 when the child can't be reached or rejects the config."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/write-check :model/Workspace id)
  (present-instance (ws.instances/push-config! id)))

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
