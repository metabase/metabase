(ns metabase-enterprise.workspaces.api
  "Thin HTTP API for workspaces. Validation, auth, and presentation only —
   all logic lives in [[metabase-enterprise.workspaces.core]]."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private WorkspaceStatus
  [:enum "unprovisioned" "provisioning" "provisioned" "deprovisioning"])

(def ^:private WorkspaceDatabaseParams
  [:map
   [:database_id   ms/PositiveInt]
   [:input_schemas [:sequential ms/NonBlankString]]])

(def ^:private CreateWorkspaceParams
  [:map {:closed true}
   [:name      ms/NonBlankString]
   [:databases [:sequential WorkspaceDatabaseParams]]])

(def ^:private UpdateWorkspaceParams
  [:map {:closed true}
   [:name      {:optional true} ms/NonBlankString]
   [:databases {:optional true} [:sequential WorkspaceDatabaseParams]]])

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
  (cond-> params
    (contains? params :databases)
    (update :databases #(mapv sanitize-database-params %))))

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
  [_route-params _query-params params :- CreateWorkspaceParams]
  (api/check-superuser)
  (present-workspace
   (ws/create-workspace!
    (assoc (sanitize-workspace-params params)
           :creator_id api/*current-user-id*))))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update an existing Workspace. Only allowed when all databases are unprovisioned."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- UpdateWorkspaceParams]
  (api/check-superuser)
  (present-workspace (ws/update-workspace! id (sanitize-workspace-params params))))

(api.macros/defendpoint :delete "/:id"
  :- [:map [:id ms/PositiveInt] [:deleted :boolean]]
  "Delete a Workspace. All databases must be unprovisioned."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (ws/delete-workspace! id)
  {:id id :deleted true})

(api.macros/defendpoint :post "/:id/provision"
  :- [:map [:workspace_id ms/PositiveInt] [:triggered ms/IntGreaterThanOrEqualToZero]]
  "Provision all unprovisioned databases. Can retry after partial failure."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  {:workspace_id id :triggered (ws/provision! id)})

(api.macros/defendpoint :post "/:id/deprovision"
  :- [:map [:workspace_id ms/PositiveInt] [:triggered ms/IntGreaterThanOrEqualToZero]]
  "Deprovision all provisioned databases."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  {:workspace_id id :triggered (ws/deprovision! id)})

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
  "Read-only summary of the workspace loaded on this (child) instance.

   Returns the most-recently-created workspace + its databases (keyed by
   `:model/Database.id`) plus the count of `:model/TableRemapping` rows currently
   active. Returns `nil` when no workspace exists.

   On a properly-bootstrapped child there is at most one workspace at a time;
   the most-recent ordering is for stability when older rows linger.

   The child has no live coupling to the parent — to refresh, re-fetch `config.yml`
   and re-run the loader."
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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes"
  (api.macros/ns-handler *ns* +auth))
