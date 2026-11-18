(ns metabase-enterprise.workspaces.api.workspace-manager
  "EE API endpoints for managing workspaces, served under `/api/ee/workspace-manager`.
   Validation and presentation only — domain logic lives in
   [[metabase-enterprise.workspaces.core]] and permission predicates live on
   `:model/Workspace` and `:model/WorkspaceDatabase` (see `mi/can-read?`/`can-write?`/`can-create?`)."
  (:require
   [clojure.string :as str]
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
   [metabase.util.malli.schema :as ms]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private WorkspaceStatus
  [:enum {:decode/api keyword}
   :unprovisioned :provisioning :provisioned :deprovisioning :teardown_failed :never_started])

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
  (into [] (map present-workspace) (mi/readable (ws/list-workspaces))))

(api.macros/defendpoint :get "/:id" :- WorkspaceResponse
  "Get a single Workspace by id."
  {:scope api-scope.workspace-manager/workspace-manager}
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/read-check :model/Workspace id)
  (present-workspace (api/check-404 (ws/get-workspace id))))

(defn- request-idempotency-key
  "The request's `Idempotency-Key` header, or nil when absent. 400 unless it is 1 to
   255 characters, not blank, with no leading or trailing whitespace. A MySQL app DB
   ignores trailing spaces when it compares keys, so `\"k\"` and `\"k \"` would be
   one key."
  [request]
  (when-let [k (get-in request [:headers "idempotency-key"])]
    (api/check-400 (and (not (str/blank? k)) (= k (str/trim k)) (<= (count k) 255))
                   "Idempotency-Key must be 1 to 255 characters, not blank, with no leading or trailing whitespace")
    k))

(api.macros/defendpoint :post "/" :- WorkspaceResponse
  "Create a new Workspace attached to the given databases (each must be eligible
   for workspaces) and provision it (blocking). A failed provisioning is an error,
   never a 200: the database's status code, or 500, with `message` and
   `cleanup_required`, true when the workspace was kept and must be deleted to
   finish the teardown.

   Send an `Idempotency-Key` header to make the request safe to retry. The key must be
   1 to 255 characters, not blank, with no leading or trailing whitespace; otherwise
   400. Keys are compared exactly, letter case included. When the current user
   already has a workspace with that key, nothing is provisioned. The response is
   that workspace (200); 409 with error code `workspace_busy` while a create or
   delete of that workspace is still running; or 500 with `workspace_id` and `cleanup_required` when
   that workspace has no databases or one that is not `provisioned`: its create
   failed or stopped, or a later delete failed. Delete the workspace, then create
   again with a new key. A create that failed and deleted its workspace frees its
   key. The body of a retry is not compared with the original, so send a key again
   only to retry the same intended workspace."
  {:scope api-scope.workspace-manager/workspace-manager}
  [_route-params _query-params params :- CreateWorkspaceParams request]
  (api/create-check :model/Workspace params)
  (present-workspace
   (ws/create-workspace!
    (assoc params
           :creator_id      api/*current-user-id*
           :idempotency_key (request-idempotency-key request)))))

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
  treated as left by a crashed instance and is torn down. A DELETE sets every
  database `deprovisioning` before its first warehouse call, so a second DELETE
  and the config download answer 409 while it runs. A `never_started` row is
  deleted without a warehouse teardown: a create that failed before that
  database's provisioning started left it, so the warehouse has nothing of its.
  A row whose teardown succeeds is deleted. A row whose teardown fails is kept,
  the workspace is kept with it, and the combined failure is the error, so the delete can be retried. Only a failure of the
  warehouse teardown itself marks the row `teardown_failed`. A failure before the
  warehouse call (a lock timeout, a failed connection lookup) leaves the row's
  status as it was, and the next DELETE retries it. After a successful warehouse
  teardown, a failed row delete or remapping cleanup also restores the row's
  previous status, so a `provisioned` row can then name dropped objects until the
  DELETE is retried. 204 on success, no response body.

  `force=true` deletes `teardown_failed` rows without a warehouse teardown and
  logs at WARN the identifiers of what may remain. It does so after the busy
  check, so a 409 deletes nothing. Use it only when the warehouse is gone for
  good. Other rows are torn down as without `force`."
  {:scope api-scope.workspace-manager/workspace-manager}
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   {:keys [force]} :- [:map {:closed true} [:force {:default false} ms/BooleanValue]]]
  (api/write-check :model/Workspace id)
  (when force
    (ws/abandon-teardown-failed-databases! id))
  (ws/delete-workspace! id)
  nil)

;;; ------------------------------------------- Config download --------------------------------------------------

(api.macros/defendpoint :get "/:id/config"
  :- [:map {:closed true}
      [:status  [:= 200]]
      [:headers [:map-of :string :string]]
      [:body    :string]]
  "Download the workspace's developer-instance config as a YAML file. 409 if any
  of the workspace's databases is not `:provisioned`. The body does not say which
  status; read `GET /:id`. Retry while a database is `provisioning` or
  `deprovisioning`. In any other status, waiting does not clear the 409; delete
  the workspace. 422 if a database's connection settings need an admin to fix
  them, if any emitted value contains `{{` or `[[`, or if the workspace has no
  databases; retrying does not help.
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
