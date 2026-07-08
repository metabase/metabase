(ns metabase-enterprise.workspaces.api.workspace-instance
  "EE API endpoints for the workspace loaded on this (child) instance, served under
   `/api/ee/workspace-instance`. See [[metabase-enterprise.workspaces.api.workspace-manager]]
   for the manager-side admin operations."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [metabase.workspaces.core :as ws.oss]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private TableNamespace
  [:map
   [:db     {:optional true} [:maybe :string]]
   [:schema {:optional true} [:maybe :string]]])

(def ^:private WorkspaceInstanceDatabase
  [:map
   [:input_schemas [:sequential :string]]
   [:output        TableNamespace]])

(def ^:private WorkspaceInstance
  [:map
   [:name      ms/NonBlankString]
   [:databases [:map-of ::lib.schema.id/database WorkspaceInstanceDatabase]]
   [:can_write :boolean]])

(def ^:private TableRemapping
  [:map
   [:id              ms/PositiveInt]
   [:database_id     ::lib.schema.id/database]
   [:from_db         [:maybe :string]]
   [:from_schema     [:maybe :string]]
   [:from_table_name ms/NonBlankString]
   [:to_db           [:maybe :string]]
   [:to_schema       [:maybe :string]]
   [:to_table_name   ms/NonBlankString]
   [:created_at      :any]])

;;; -------------------------------------------- Presentation --------------------------------------------------

(defn- present-remapping [row]
  (select-keys row [:id :database_id
                    :from_db :from_schema :from_table_name
                    :to_db :to_schema :to_table_name
                    :created_at]))

(defn- present-workspace-instance-database [wsd]
  (select-keys wsd [:input_schemas :output]))

(defn- present-workspace-instance [workspace]
  {:name      (:name workspace)
   :databases (update-vals (:databases workspace) present-workspace-instance-database)
   :can_write (not (ws/workspace-locked-by-config?))})

;;; ------------------------------------------------ Guards ----------------------------------------------------

(defn- check-workspace-writable!
  "Throw a 400 if this instance's workspace is locked by deployment config (a
  `config.yml` `:workspace` section or the `MB_INSTANCE_WORKSPACE` env var).
  Call after `check-superuser`, so a non-admin still gets a 403 rather than this."
  []
  (when (ws/workspace-locked-by-config?)
    (throw (ex-info (tru "This instance''s workspace is set by deployment config (`config.yml` or the `MB_INSTANCE_WORKSPACE` env var) and can''t be changed at runtime. Remove that config and restart this instance to enable workspace edits.")
                    {:status-code 400
                     :workspace-locked-by-config true}))))

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/current" :- [:map [:data [:maybe WorkspaceInstance]]]
  "Read-only summary of the workspace loaded on this instance, wrapped in a
  `{:data ...}` envelope.

  Reads from the `instance-workspace` setting populated at boot by the `:workspace`
  section of `config.yml`, or at runtime by `POST /current`. `:data` is `null`
  when no workspace was loaded — i.e. this is a manager-only instance, or no
  `config.yml` was present at boot and `POST /current` hasn't been called.
  The envelope avoids an empty JSON body for the `nil` case.

  The workspace's `can_write` flag is `false` when it was set by deployment
  config (`config.yml` or `MB_INSTANCE_WORKSPACE`); `POST`/`DELETE` are rejected
  in that case."
  []
  (api/check-superuser)
  {:data (some-> (ws/instance-workspace) present-workspace-instance)})

(api.macros/defendpoint :post "/current" :- WorkspaceInstance
  "Install a workspace config on this instance at runtime. Accepts the same shape
  `GET /current` returns and persists it via the `instance-workspace` setting so
  it survives restarts. Use this on a running instance to enter workspace mode
  without restarting from `config.yml`.

  Returns 400 if the workspace was set by deployment config (`config.yml` or
  `MB_INSTANCE_WORKSPACE`) and so is read-only."
  [_route-params
   _query-params
   body :- ::ws.oss/workspace-instance-config]
  (api/check-superuser)
  (check-workspace-writable!)
  (ws/set-instance-workspace! body)
  (present-workspace-instance (ws/instance-workspace)))

(api.macros/defendpoint :delete "/current" :- :nil
  "Clear the workspace config on this instance. After this returns, the instance
  is no longer in workspace mode and `GET /current` returns `nil`. Also drops
  every `TableRemapping` row, since stale mappings from the prior workspace
  would otherwise keep rewriting queries on the now-unmanaged databases.

  Returns 400 if the workspace was set by deployment config (`config.yml` or
  `MB_INSTANCE_WORKSPACE`) and so is read-only."
  []
  (api/check-superuser)
  (check-workspace-writable!)
  (ws/clear-instance-workspace!)
  (ws/clear-all-remappings!)
  nil)

(api.macros/defendpoint :get "/table-remappings" :- [:sequential TableRemapping]
  "Return all table remappings, ordered by id."
  []
  (api/check-superuser)
  (mapv present-remapping (ws/list-remappings)))
