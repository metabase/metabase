(ns metabase-enterprise.workspaces.api
  (:require
   [metabase-enterprise.workspaces.config :as config]
   [metabase-enterprise.workspaces.core :as ws-core]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.table-remapping.model]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment metabase.table-remapping.model/keep-me)

(def ^:private WorkspaceStatus
  [:enum "unprovisioned" "provisioning" "provisioned" "unprovisioning"])

(def ^:private WorkspaceDatabaseParams
  [:map
   [:database_id   ms/PositiveInt]
   [:input_schemas [:sequential ms/NonBlankString]]])

(def ^:private WorkspaceParams
  [:map {:closed true}
   [:name      ms/NonBlankString]
   [:databases [:sequential {:min 1} WorkspaceDatabaseParams]]])

(defn- sanitize-workspace-database-params
  "Strip server-controlled fields the client is not allowed to set."
  [wsd]
  (select-keys wsd [:database_id :input_schemas]))

(defn- sanitize-workspace-params [params]
  (update params :databases #(mapv sanitize-workspace-database-params %)))

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

(defn- present-workspace-database [wsd]
  (-> wsd
      (select-keys [:database_id :database_details :output_schema :input_schemas :status])
      (update :status name)))

(defn- present-creator [creator]
  (when creator
    (select-keys creator [:id :first_name :last_name :email :common_name])))

(defn- present-workspace [ws]
  (some-> ws
          (select-keys [:id :name :creator :created_at :updated_at :databases])
          (update :creator present-creator)
          (update :databases #(mapv present-workspace-database %))))

(api.macros/defendpoint :get "/" :- [:sequential WorkspaceResponse]
  "List all Workspaces with their databases."
  []
  (api/check-superuser)
  (mapv present-workspace (workspace/list-workspaces)))

(defn- enrich-remappings-with-table-ids [rows]
  (let [db-ids (into #{} (map :database_id) rows)
        tables (when (seq db-ids)
                 (t2/select [:model/Table :id :db_id :schema :name]
                            :db_id [:in db-ids]))
        lookup (into {}
                     (map (fn [t] [[(:db_id t) (:schema t) (:name t)] (:id t)]))
                     tables)]
    (mapv (fn [r]
            (assoc r
                   :from_table_id (get lookup [(:database_id r) (:from_schema r) (:from_table_name r)])
                   :to_table_id   (get lookup [(:database_id r) (:to_schema r) (:to_table_name r)])))
          rows)))

(api.macros/defendpoint :get "/remappings"
  "Return every row in the `table_remapping` table, each enriched with
  `:from_table_id` and `:to_table_id` — the corresponding metabase_table ids,
  or nil when no matching Table row exists."
  []
  (api/check-superuser)
  (enrich-remappings-with-table-ids
   (t2/select :model/TableRemapping {:order-by [[:id :asc]]})))

(api.macros/defendpoint :get "/current"
  "Return the currently active workspace config (or null if no workspace is active).
  Enriches the config with `:remappings_count` — the total number of
  `table_remapping` rows whose `database_id` belongs to this workspace."
  []
  (api/check-superuser)
  (when-let [config (ws-core/get-config)]
    (let [db-ids           (keys (:databases config))
          remappings-count (if (seq db-ids)
                             (t2/count :model/TableRemapping :database_id [:in db-ids])
                             0)]
      (assoc config :remappings_count remappings-count))))

(api.macros/defendpoint :get "/:id" :- WorkspaceResponse
  "Get a single Workspace by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (present-workspace (api/check-404 (workspace/get-workspace id))))

(api.macros/defendpoint :post "/" :- WorkspaceResponse
  "Create a new Workspace. The authenticated user is recorded as :creator_id."
  [_route-params
   _query-params
   params :- WorkspaceParams]
  (api/check-superuser)
  (present-workspace
   (workspace/create-workspace!
    (assoc (sanitize-workspace-params params)
           :creator_id api/*current-user-id*))))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update an existing Workspace. The supplied `:databases` list fully replaces the existing set."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- WorkspaceParams]
  (api/check-superuser)
  (api/check-404 (workspace/get-workspace id))
  (present-workspace (workspace/update-workspace! id (sanitize-workspace-params params))))

(api.macros/defendpoint :post "/:id/provision"
  :- [:map [:workspace_id ms/PositiveInt] [:triggered ms/IntGreaterThanOrEqualToZero]]
  "Kick off asynchronous provisioning for every uninitialized WorkspaceDatabase under
  this Workspace. Returns immediately with the number of rows that were scheduled."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (workspace/get-workspace id))
  {:workspace_id id
   :triggered    (provisioning/provision-workspace! id)})

(api.macros/defendpoint :post "/:id/unprovision"
  :- [:map [:workspace_id ms/PositiveInt] [:triggered ms/IntGreaterThanOrEqualToZero]]
  "Kick off asynchronous unprovisioning for every initialized WorkspaceDatabase under
  this Workspace. Returns immediately with the number of rows that were scheduled."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (workspace/get-workspace id))
  {:workspace_id id
   :triggered    (provisioning/unprovision-workspace! id)})

(api.macros/defendpoint :delete "/:id"
  :- [:map [:id ms/PositiveInt] [:deleted :boolean]]
  "Delete a Workspace. Returns 409 if any of its databases is in a non-
  `:unprovisioned` state — unprovision first."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (workspace/get-workspace id))
  (workspace/delete-workspace! id)
  {:id id :deleted true})

(api.macros/defendpoint :get "/:id/config/:format"
  "Return a downloadable config.yml-shaped config file for this Workspace in the
  requested format (`json` or `yaml`). Bundles the workspace's databases, a single
  default admin user, and the workspace mapping. Returns 409 if any of the
  Workspace's databases is not `:provisioned`."
  [{:keys [id format]} :- [:map
                           [:id     ms/PositiveInt]
                           [:format (ms/enum-decode-keyword [:json :yaml])]]]
  (api/check-superuser)
  (let [result (api/check-404 (config/build-workspace-config id))]
    (case format
      :json result
      :yaml {:status  200
             :headers {"Content-Type" "application/yaml"}
             :body    (config/config->yaml result)})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes"
  (api.macros/ns-handler *ns* +auth))
