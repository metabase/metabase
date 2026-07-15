(ns metabase-enterprise.workspaces.api.workspace-manager
  "EE API endpoints for managing workspaces, served under `/api/ee/workspace-manager`.
   Validation and presentation only — domain logic lives in
   [[metabase-enterprise.workspaces.core]] and permission predicates live on
   `:model/Workspace` and `:model/WorkspaceDatabase` (see `mi/can-read?`/`can-write?`/`can-create?`)."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.schema :as serialization.schema]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.hm-instance :as hm-instance]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.server.streaming-response :as sr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.secret :as u.secret]
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
   ;; export branch; omitted = auto-named ws-<slug>-<id>. 409 when another
   ;; workspace already exports to the same branch.
   [:target_branch {:optional true} ms/NonBlankString]
   ;; when true, also mint the agent api-key, build config.yml, and spawn the child
   ;; instance via Harbormaster (blocking). Off by default so the config-download flow
   ;; and local rigs keep working without HM.
   [:spawn_instance {:optional true} [:maybe ms/BooleanValue]]])

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
   [:id            ms/PositiveInt]
   [:name          ms/NonBlankString]
   [:creator       [:maybe CreatorResponse]]
   [:base_branch   {:optional true} [:maybe :string]]
   [:target_branch {:optional true} [:maybe :string]]
   ;; child-instance fields: present once an instance has been spawned via HM
   [:url          {:optional true} [:maybe :string]]
   ;; returned ONLY by the create response when spawn_instance=true — the key value
   ;; exists in memory at mint time only (the parent stores just its prefix)
   [:api_key      {:optional true} ms/NonBlankString]
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
          (select-keys [:id :name :creator :base_branch :target_branch :created_at :updated_at :databases])
          (m/assoc-some :url (:instance_url workspace))
          (update :creator present-creator)
          (m/update-existing :databases #(mapv present-workspace-database %))))

(defn- creator-email-for-child
  "Email stamped as the `api-keys:` section's `creator:` in the child config. Must
  be a human admin that exists on the child at boot (the child's apply refuses
  unknown/non-admin creators — see `advanced-config.file.api-keys`). When the
  creating credential is itself an api-key, its synthetic `@api-key.invalid` user
  exists nowhere else, so fall back to the oldest active superuser — the same
  admin identity HM seeds child instances with (GHY-4063 contract point)."
  []
  ;; :type is not in the current-user column set, so fetch it directly
  (if (= :api-key (t2/select-one-fn :type :model/User :id api/*current-user-id*))
    (t2/select-one-fn :email :model/User
                      :is_superuser true :is_active true :type :personal
                      {:order-by [[:id :asc]]})
    (:email @api/*current-user*)))

(defn- spawn-instance!
  "Create-orchestration tail for `spawn_instance=true`: mint the agent api-key
  (GHY-4056), build the config.yml with the api-keys + settings sections (GHY-4057),
  POST it to Harbormaster (blocking), record the HM instance id + child URL, and
  return the workspace response with `:url` and — only here, only once — `:api_key`.

  An HM failure throws a 502 and leaves the provisioned workspace in place: the
  caller can retry by deleting and re-creating, and nothing secret has leaked (the
  minted key died with this request; a retry mints a fresh one)."
  [ws-id]
  (let [api-key (u.secret/expose (workspace/mint-api-key! ws-id))
        config  (ws.config/build-workspace-config ws-id
                                                  {:api-key       api-key
                                                   :creator-email (creator-email-for-child)})
        {hm-id :id url :url} (hm-instance/create-instance! {:workspace-id ws-id
                                                            :name         (str "ws-" ws-id)
                                                            :config-yml   (ws.config/config->yaml config)})]
    (t2/update! :model/Workspace :id ws-id {:hm_instance_id hm-id :instance_url url})
    (-> (present-workspace (ws/get-workspace ws-id))
        (assoc :api_key api-key))))

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/" :- [:sequential WorkspaceResponse]
  "List all Workspaces."
  {:scope "mb:workspace-manager"}
  []
  (api/check-superuser)
  (into [] (comp (filter mi/can-read?)
                 (map present-workspace))
        (ws/list-workspaces)))

(api.macros/defendpoint :get "/:id" :- WorkspaceResponse
  "Get a single Workspace by id."
  {:scope "mb:workspace-manager"}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/read-check :model/Workspace id)
  (present-workspace (api/check-404 (ws/get-workspace id))))

(api.macros/defendpoint :post "/" :- WorkspaceResponse
  "Create a new Workspace attached to the given databases (each must be eligible
   for workspaces) and provision it (blocking). With `spawn_instance=true`, also
   mint the agent api-key, build the child config.yml, and spawn the child instance
   via Harbormaster (blocking) — the response then carries `:url` and `:api_key`
   (the only time the key is ever returned)."
  {:scope "mb:workspace-manager"}
  [_route-params _query-params {:keys [spawn_instance] :as params} :- CreateWorkspaceParams]
  (api/create-check :model/Workspace params)
  (let [ws (ws/create-workspace!
            (-> params
                (dissoc :spawn_instance)
                (assoc :creator_id api/*current-user-id*)))]
    (if spawn_instance
      (spawn-instance! (:id ws))
      (present-workspace ws))))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update a workspace's name."
  {:scope "mb:workspace-manager"}
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
  {:scope "mb:workspace-manager"}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {ignore-pending? :ignore-pending} :- [:map [:ignore-pending {:default false} [:maybe ms/BooleanValue]]]]
  (api/write-check :model/Workspace id)
  ;; capture before the row is deleted; HM delete runs AFTER warehouse teardown so a
  ;; teardown refusal (409) never orphans a half-deleted workspace
  (let [hm-id  (t2/select-one-fn :hm_instance_id :model/Workspace :id id)
        result (assoc (ws/delete-workspace! id (boolean ignore-pending?)) :id id)]
    (if (and hm-id (not (hm-instance/delete-instance! hm-id)))
      (update result :message #(->> [% (format "Harbormaster instance %s could not be deleted; HM's backstop reaper will collect it." hm-id)]
                                    (remove nil?)
                                    (str/join " ")))
      result)))

;;; ------------------------------------------- Config download --------------------------------------------------

(api.macros/defendpoint :get "/:id/config"
  :- [:map
      [:status  [:= 200]]
      [:headers [:map-of :string :string]]
      [:body    :string]]
  "Download the workspace's developer-instance config as a YAML file. 409 if any
  of the workspace's databases is not `:provisioned`."
  {:scope "mb:workspace-manager"}
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
  {:scope "mb:workspace-manager"}
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
