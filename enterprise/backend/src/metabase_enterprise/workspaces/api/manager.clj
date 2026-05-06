(ns metabase-enterprise.workspaces.api.manager
  "EE API endpoints for managing workspaces (admin), served under `/api/ee/workspace-manager`.
   Validation, auth, and presentation only — all logic lives in
   [[metabase-enterprise.workspaces.core]]."
  (:require
   [medley.core :as m]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.schema :as-alias serialization.schema]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.server.streaming-response :as sr]
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
  [:map {:closed true}
   [:database_id      ms/PositiveInt]
   [:output_schema    :string]
   [:input_schemas    [:sequential ms/NonBlankString]]
   [:status           WorkspaceStatus]])

(def ^:private CreatorResponse
  [:map {:closed true}
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
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:name        ms/NonBlankString]
   [:creator     [:maybe CreatorResponse]]
   [:created_at  Timestamp]
   [:updated_at  Timestamp]
   ;; `:databases` is only included when hydrated (i.e. the GET /:id endpoint).
   ;; The list endpoint omits it — clients should treat a missing array as `[]`.
   [:databases   {:optional true} [:sequential WorkspaceDatabaseResponse]]])

;;; -------------------------------------------- Presentation --------------------------------------------------

(defn- present-workspace-database [wsd]
  (-> (select-keys wsd [:database_id :output_schema :input_schemas :status])
      (update :status name)))

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

;;; ------------------------------------------- Config download --------------------------------------------------

(api.macros/defendpoint :get "/:id/config"
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

;;; ----------------------------------------- Metadata export --------------------------------------------------

(defn- workspace-metadata-filters
  "Derive the `:database-ids` and `:schema-ids` filter values from a hydrated workspace."
  [workspace]
  {:database-ids (mapv :database_id (:databases workspace))
   :schema-ids   (vec (for [{:keys [database_id input_schemas]} (:databases workspace)
                            schema                              input_schemas]
                        [database_id schema]))})

(api.macros/defendpoint :get "/:id/metadata/export"
  :- (sr/streaming-response-schema ::serialization.schema/metadata-export-response)
  "Stream the warehouse metadata (databases, tables, fields) for the workspace's databases,
  scoped to each database's `:input_schemas`. Same flag semantics as
  `/api/ee/serialization/metadata/export` — sections must be opted into via the
  `with-databases` / `with-tables` / `with-fields` query parameters."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {:keys [with-databases with-tables with-fields]}
   :- [:map
       [:with-databases {:default false} [:maybe :boolean]]
       [:with-tables    {:default false} [:maybe :boolean]]
       [:with-fields    {:default false} [:maybe :boolean]]]]
  (api/check-superuser)
  (let [workspace (api/check-404 (ws/get-workspace id))
        filters   (workspace-metadata-filters workspace)]
    (sr/streaming-response {:content-type "application/json; charset=utf-8"} [os _]
      (serialization/write-databases-metadata!
       os
       (merge filters
              {:with-databases? with-databases
               :with-tables?    with-tables
               :with-fields?    with-fields})))))
