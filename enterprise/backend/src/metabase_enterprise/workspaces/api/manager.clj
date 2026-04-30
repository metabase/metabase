(ns metabase-enterprise.workspaces.api.manager
  "EE API endpoints for managing workspaces (admin), served under `/api/ee/workspace-manager`.
   Validation, auth, and presentation only — all logic lives in
   [[metabase-enterprise.workspaces.core]]."
  (:require
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.table-metadata :as ws.table-metadata]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.server.streaming-response :as server.streaming-response :refer [streaming-response]]
   [metabase.util.malli.schema :as ms]
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
   [:id          ms/PositiveInt]
   [:first_name  [:maybe :string]]
   [:last_name   [:maybe :string]]
   [:email       ms/NonBlankString]
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
          (select-keys [:id :name :creator :created_at :updated_at :databases :sharing_key])
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

;;; ----------------------------------------- Sharing key endpoints -----------------------------------------------

(api.macros/defendpoint :post "/:id/sharing-key"
  "Set or rotate the sharing key for a workspace. The key is a fresh UUID, distinct from
  the developer instance's admin API key (which is supplied separately at runtime via
  the `MB_WORKSPACE_API_KEY` env var). Returns the new key."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (ws/get-workspace id))
  (let [new-key (str (random-uuid))]
    (t2/update! :model/Workspace :id id {:sharing_key new-key})
    {:sharing_key new-key}))

(api.macros/defendpoint :delete "/:id/sharing-key"
  "Remove the sharing key from a workspace, disabling unauthenticated access."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (ws/get-workspace id))
  (t2/update! :model/Workspace :id id {:sharing_key nil})
  {:sharing_key nil})

;;; ------------------------------------------- Config download --------------------------------------------------

(api.macros/defendpoint :get "/:id/config/yaml"
  :- [:map
      [:status  [:= 200]]
      [:headers [:map-of :string :string]]
      [:body    :string]]
  "Download the workspace's developer-instance config as a YAML file. 409 if any
  of the workspace's databases is not `:provisioned`."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [config (api/check-404 (ws.config/build-workspace-config id))]
    {:status  200
     :headers {"Content-Type"        "application/x-yaml"
               "Content-Disposition" "attachment; filename=\"config.yml\""}
     :body    (ws.config/config->yaml config)}))

(defn- workspace-db-id->schemas
  "Build a `{database-id #{schema-name}}` map from a hydrated workspace, covering
  every provisioned WorkspaceDatabase's input schemas plus its output schema.
  Used to scope the table-metadata and field-values exports to just the data the
  workspace exposes."
  [ws]
  (into {}
        (keep (fn [wsd]
                (when (= :provisioned (:status wsd))
                  (let [schemas (cond-> (set (:input_schemas wsd))
                                  (:output_schema wsd) (conj (:output_schema wsd)))]
                    [(:database_id wsd) schemas]))))
        (:databases ws)))

(api.macros/defendpoint :get "/:id/table-metadata/json"
  :- (server.streaming-response/streaming-response-schema
      [:map
       [:databases [:sequential :map]]
       [:tables    [:sequential :map]]
       [:fields    [:sequential :map]]])
  "Download the workspace's database/table metadata as a JSON file. Streamed —
  rows are pulled from the database and written to the response in batches so
  large warehouses don't have to be materialized in memory."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [ws             (api/check-404 (ws/get-workspace id))
        db-id->schemas (workspace-db-id->schemas ws)]
    (streaming-response {:content-type "application/json; charset=utf-8"
                         :headers      {"Content-Disposition" "attachment; filename=\"table_metadata.json\""}}
                        [os _]
                        (ws.table-metadata/write-table-metadata! os db-id->schemas))))

(api.macros/defendpoint :get "/:id/field-values/json"
  :- (server.streaming-response/streaming-response-schema
      [:map [:field_values [:sequential :map]]])
  "Download the workspace's sampled field values as a JSON file. Streamed for the
  same reason as `/:id/table-metadata/json`."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [ws             (api/check-404 (ws/get-workspace id))
        db-id->schemas (workspace-db-id->schemas ws)]
    (streaming-response {:content-type "application/json; charset=utf-8"
                         :headers      {"Content-Disposition" "attachment; filename=\"field_values.json\""}}
                        [os _]
                        (ws.table-metadata/write-field-values! os db-id->schemas))))
