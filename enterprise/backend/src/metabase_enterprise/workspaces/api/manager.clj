(ns metabase-enterprise.workspaces.api.manager
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
   [metabase.models.interface :as mi]
   [metabase.server.streaming-response :as sr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment serialization.schema/keep-me)

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private WorkspaceStatus
  [:enum "unprovisioned" "provisioning" "provisioned" "deprovisioning"])

(def ^:private TableNamespaceParam
  "Wire shape for a workspace input namespace: `{:db ?, :schema ?}`. At least one
   of the keys must be a non-blank string. 3-slot drivers (Snowflake, SQL Server,
   BigQuery) require `:db`. 2-slot drivers (Postgres, Redshift, ClickHouse)
   typically use `:schema` only. MySQL uses `:db` only."
  [:and
   [:map {:closed true}
    [:db     {:optional true} [:maybe ms/NonBlankString]]
    [:schema {:optional true} [:maybe ms/NonBlankString]]]
   [:fn {:error/message "namespace must populate at least one of :db or :schema"}
    (fn [m] (or (some? (:db m)) (some? (:schema m))))]])

(def ^:private DatabaseEntry
  [:map {:closed true}
   [:database_id ms/PositiveInt]
   [:input       [:sequential {:min 1} TableNamespaceParam]]])

(def ^:private CreateWorkspaceParams
  [:map {:closed true}
   [:name      ms/NonBlankString]
   [:databases {:optional true} [:sequential DatabaseEntry]]])

(def ^:private UpdateWorkspaceParams
  [:map {:closed true}
   [:name      {:optional true} ms/NonBlankString]
   [:databases {:optional true} [:sequential DatabaseEntry]]])

(def ^:private WorkspaceDatabaseResponse
  [:map {:closed true}
   [:database_id   ms/PositiveInt]
   [:output_schema :string]
   [:input         [:sequential TableNamespaceParam]]
   [:status        WorkspaceStatus]])

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
  (-> (select-keys wsd [:database_id :output_schema :input :status])
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

(api.macros/defendpoint :post "/"
  "Create a new Workspace, optionally with databases to provision."
  [_route-params _query-params params :- CreateWorkspaceParams]
  (api/create-check :model/Workspace params)
  (let [ws (ws/create-workspace!
            (assoc params :creator_id api/*current-user-id*))]
    (if (seq (:databases params))
      (try
        (present-workspace (ws/reconcile-workspace-databases! ws (:databases params) api/*current-user-id*))
        (catch Exception e
          (if (= 207 (:status-code (ex-data e)))
            {:status  207
             :body    (-> (ex-data e)
                          (update :workspace present-workspace))}
            (throw e))))
      (present-workspace ws))))

(api.macros/defendpoint :put "/:id"
  "Update a workspace. Accepts `:name` and/or `:databases`.

   When `:databases` is supplied, the workspace's database list is diffed against
   the desired state:
   - databases in the payload but not currently present → added and provisioned
   - databases currently present but absent from the payload → deprovisioned and removed
   - databases in both but with changed `:input` → deprovisioned, updated, and reprovisioned
   - databases in both with unchanged `:input` → left alone

   Each database operation is independent — partial failures leave affected rows
   with their real status (e.g. `:unprovisioned` if provisioning failed).
   Returns 207 with error details when some operations fail."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- UpdateWorkspaceParams]
  (let [ws (api/check-404 (ws/get-workspace id))]
    (api/write-check ws)
    (when (:name params)
      (t2/update! :model/Workspace :id id {:name (:name params)}))
    (if (contains? params :databases)
      (try
        (present-workspace (ws/reconcile-workspace-databases! ws (:databases params) api/*current-user-id*))
        (catch Exception e
          (if (= 207 (:status-code (ex-data e)))
            {:status  207
             :body    (-> (ex-data e)
                          (update :workspace present-workspace))}
            (throw e))))
      (present-workspace (ws/get-workspace id)))))

(api.macros/defendpoint :delete "/:id"
  :- [:map [:id ms/PositiveInt] [:deleted :boolean]]
  "Delete a Workspace. Deprovisions all databases first (blocking)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/write-check :model/Workspace id)
  (ws/delete-workspace! id)
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

;;; ----------------------------------------- Metadata export --------------------------------------------------

(defn- workspace-metadata-filters
  "Derive the `:database-ids` and `:schema-ids` filter values from a hydrated workspace.
   `:schema-ids` is a `{db-id [\"schema\" ...]}` map matching the metadata export schema.
   Each per-row vector is built from the new `::table-namespace` shape — pull `:schema`
   from each input map; drivers without a schema slot (MySQL) contribute an empty list."
  [{:keys [databases]}]
  {:database-ids (mapv :database_id databases)
   :schema-ids   (into {}
                       (map (fn [{:keys [database_id input]}]
                              [database_id (vec (keep :schema input))]))
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
