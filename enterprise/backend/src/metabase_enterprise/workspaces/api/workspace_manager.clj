(ns metabase-enterprise.workspaces.api.workspace-manager
  "EE API endpoints for managing workspaces, served under `/api/ee/workspace-manager`.
   Validation and presentation only — domain logic lives in
   [[metabase-enterprise.workspaces.core]] and permission predicates live on
   `:model/Workspace` and `:model/WorkspaceDatabase` (see `mi/can-read?`/`can-write?`/`can-create?`)."
  (:require
   [medley.core :as m]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.api-scope.workspace-manager :as api-scope.workspace-manager]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.scope :as scope]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private WorkspaceStatus
  [:enum {:decode/api keyword}
   :unprovisioned :provisioning :provisioned :deprovisioning])

(def ^:private WorkspaceName
  "A workspace name that fits the `workspace.name` column, a `varchar(254)`. Postgres and MySQL count that limit in
  code points and H2 in UTF-16 code units. `:max` counts UTF-16 code units, the larger count, so a name this schema
  accepts fits on each of them. The message names the unit, because a reader counts an emoji as one character."
  [:and
   ms/NonBlankString
   (mu/with-api-error-message
    [:string {:max 254}]
    (deferred-tru "value must be at most 254 UTF-16 code units; an emoji counts as two."))])

(def ^:private CreateWorkspaceParams
  [:map {:closed true}
   [:name         WorkspaceName]
   [:database_ids [:sequential {:min 1} ::lib.schema.id/database]]])

(def ^:private UpdateWorkspaceParams
  [:map {:closed true}
   [:name {:optional true} WorkspaceName]])

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
   ;; Both the list and GET /:id endpoints hydrate `:databases`; it stays
   ;; optional so clients treat a missing array as `[]`.
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
  {:scope api-scope.workspace-manager/workspace-manager}
  []
  (api/check-superuser)
  (into [] (comp (filter mi/can-read?)
                 (map present-workspace))
        (t2/hydrate (ws/list-workspaces) :can_read)))

(api.macros/defendpoint :get "/:id" :- WorkspaceResponse
  "Get a single Workspace by id."
  {:scope api-scope.workspace-manager/workspace-manager}
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/read-check :model/Workspace id)
  (present-workspace (api/check-404 (ws/get-workspace id))))

(api.macros/defendpoint :post "/" :- WorkspaceResponse
  "Create a new Workspace attached to the given databases (each must be eligible
   for workspaces) and provision it (blocking)."
  {:scope api-scope.workspace-manager/workspace-manager}
  [_route-params _query-params params :- CreateWorkspaceParams]
  (api/create-check :model/Workspace params)
  (present-workspace
   (ws/create-workspace!
    (assoc params :creator_id api/*current-user-id*))))

(api.macros/defendpoint :put "/:id" :- WorkspaceResponse
  "Update a workspace's name."
  {:scope api-scope.workspace-manager/workspace-manager}
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   params :- UpdateWorkspaceParams]
  (api/write-check :model/Workspace id)
  (when (:name params)
    (ws.db/update-workspace-name! id (:name params)))
  (present-workspace (api/check-404 (ws/get-workspace id))))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a Workspace: tear down each database's warehouse isolation (blocking),
  then delete the workspace. 409 (error code `workspace_busy`, nothing changed)
  while a create or deprovision is running on any of its databases, meaning a row
  is `:provisioning` or `:deprovisioning` and any row of the workspace was last
  updated within the last 15 minutes. Once every row is older, such a row is
  treated as left by a crashed instance and is torn down. A row whose teardown
  succeeds is deleted. A row whose teardown fails is kept, the workspace is kept
  with it, and the combined failure is the error, so the delete can be retried.
  204 on success, no response body."
  {:scope api-scope.workspace-manager/workspace-manager}
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/write-check :model/Workspace id)
  (ws/delete-workspace! id)
  nil)

;;; ------------------------------------------- Config download --------------------------------------------------

(api.macros/defendpoint :get "/:id/config"
  :- [:map {:closed true}
      [:status  [:= 200]]
      [:headers [:map-of :string :string]]
      [:body    :string]]
  "Download the workspace's developer-instance config as a YAML file. 409 if any
  of the workspace's databases is not `:provisioned`; retry later. 422 if a
  database's connection settings need an admin to fix them, if any emitted
  value contains `{{` or `[[`, or if the workspace has no databases; retrying
  does not help.
  A scoped credential (an `mb:workspace-manager` API key or token) gets 422 when any
  of the workspace's databases uses an SSH tunnel, because the config would need the
  parent's tunnel secrets; an unscoped admin credential gets them."
  {:scope api-scope.workspace-manager/workspace-manager}
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   _body
   {:keys [token-scopes]}]
  (api/write-check :model/Workspace id)
  (let [config (api/check-404 (ws.config/build-workspace-config id))]
    (when (and (seq token-scopes) (not (contains? token-scopes ::scope/unrestricted)))
      (ws.config/check-no-tunnelled-databases id))
    {:status  200
     :headers {"Content-Type"        "application/x-yaml"
               "Content-Disposition" "attachment; filename=\"config.yml\""}
     :body    (ws.config/config->yaml config)}))
