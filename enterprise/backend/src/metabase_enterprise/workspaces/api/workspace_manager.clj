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
   [:database_ids [:sequential {:min 1} ::lib.schema.id/database]]])

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
   for workspaces) and provision it (blocking)."
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
