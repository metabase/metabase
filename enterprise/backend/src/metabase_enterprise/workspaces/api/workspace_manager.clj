(ns metabase-enterprise.workspaces.api.workspace-manager
  "EE API endpoints for managing workspaces, served under `/api/ee/workspace-manager`.
   Validation and presentation only — domain logic lives in
   [[metabase-enterprise.workspaces.core]] and permission predicates live on
   `:model/Workspace` and `:model/WorkspaceDatabase` (see `mi/can-read?`/`can-write?`/`can-create?`)."
  (:require
   [medley.core :as m]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.deployment :as deployment]
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
   ;; The hydrated `:model/Database` the `:database_id` points at. `:details` is dropped
   ;; for callers without write permission via `mi/to-json` at JSON-encoding time.
   [:database         [:maybe :map]]])

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
  (select-keys wsd [:database_id :input_schemas :output_namespace :status :database]))

(defn- present-creator [creator]
  (when creator
    (select-keys creator [:id :first_name :last_name :email :common_name])))

(defn- present-workspace [workspace]
  (some-> workspace
          (select-keys [:id :name :creator :created_at :updated_at :databases])
          (update :creator present-creator)
          (m/update-existing :databases #(mapv present-workspace-database %))))

(defn- present-instance
  "Shape a `workspace_instance` row for the API: drop the encrypted `api_key`
  so it never leaves the server."
  [instance]
  (select-keys instance [:id :url :name :workspace_id :created_at :updated_at]))

(defn- reject-workspace-id!
  "An instance is bound to a workspace only by the automatic deployment on workspace
   creation. Refuse (400) any attempt to set `workspace_id` directly through CRUD."
  [params]
  (when (contains? params :workspace_id)
    (throw (ex-info "workspace_id cannot be set via this endpoint; it is bound automatically on workspace creation."
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
  "Create a new Workspace. Every database whose driver supports the `:workspace`
   feature, whose `database-enable-workspaces` setting is enabled, and on which the
   caller has the workspaces permission is added to the workspace and provisioned
   automatically, all in a single transaction (blocking). The workspace is then
   deployed onto any free pool instance — 400 straight away when the pool has no
   free instance."
  [_route-params _query-params params :- CreateWorkspaceParams]
  (api/create-check :model/Workspace params)
  (deployment/check-free-instance-available!)
  (let [workspace (ws/create-workspace! (assoc params :creator_id api/*current-user-id*))]
    (deployment/provision! (:id workspace) nil)
    (present-workspace (api/check-404 (ws/get-workspace (:id workspace))))))

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

;;; ------------------------------------------- Instance pool CRUD ---------------------------------------------
;;;
;;; The pool registry of pre-booted dev (child) instances. Gated by the
;;; `:model/WorkspaceInstance` permission predicates (Data Analyst to read; Data Analyst
;;; + `:perms/workspaces` to create/write). `workspace_id` is set only by the automatic
;;; deployment on workspace creation, never here.

(api.macros/defendpoint :get "/instance" :- [:sequential InstanceResponse]
  "List all registered dev instances in the pool."
  []
  ;; Top-level gate + per-row `mi/can-read?`, mirroring the workspace list endpoint.
  (api/check-data-analyst)
  (into [] (comp (filter mi/can-read?)
                 (map present-instance))
        (t2/select :model/WorkspaceInstance {:order-by [[:id :asc]]})))

(api.macros/defendpoint :get "/instance/:id" :- InstanceResponse
  "Get a single pool instance by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (present-instance (api/read-check :model/WorkspaceInstance id)))

(def ^:private instance-writable-keys [:url :api_key :name])

(api.macros/defendpoint :post "/instance" :- InstanceResponse
  "Register a new dev instance in the pool. Starts free (unbound). The instance must be
   reachable with the provided `api_key` (verified via its `GET /api/user/current`)."
  [_route-params _query-params params :- CreateInstanceParams]
  (api/create-check :model/WorkspaceInstance params)
  (reject-workspace-id! params)
  (deployment/verify-instance-reachable! params)
  (let [row (select-keys params instance-writable-keys)]
    (present-instance
     (t2/select-one :model/WorkspaceInstance
                    :id (t2/insert-returning-pk! :model/WorkspaceInstance row)))))

(api.macros/defendpoint :put "/instance/:id" :- InstanceResponse
  "Rename a pool instance. Only `name` is editable; `url`/`api_key` are immutable and
   `workspace_id` is set only by the automatic deployment on workspace creation."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   params :- UpdateInstanceParams]
  (api/write-check :model/WorkspaceInstance id)
  (reject-workspace-id! params)
  (let [row (select-keys params [:name])]
    (when (seq row)
      (t2/update! :model/WorkspaceInstance :id id row)))
  (present-instance (t2/select-one :model/WorkspaceInstance :id id)))

(api.macros/defendpoint :delete "/instance/:id"
  :- [:map [:id ms/PositiveInt] [:deleted :boolean]]
  "Remove a pool instance. 400 if it is currently provisioned — deprovision first."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [instance (api/write-check :model/WorkspaceInstance id)]
    (deployment/check-instance-deletable! instance)
    (t2/delete! :model/WorkspaceInstance :id id)
    {:id id :deleted true}))
