(ns metabase-enterprise.workspaces.api.workspace-instance
  "EE API endpoints for the workspace loaded on this (child) instance, served under
   `/api/ee/workspace-instance`. See [[metabase-enterprise.workspaces.api.workspace-manager]]
   for the manager-side admin operations."
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]
   [metabase.workspaces.core :as ws.oss]
   [toucan2.core :as t2]))

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
   [:databases [:map-of ::lib.schema.id/database WorkspaceInstanceDatabase]]])

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
   :databases (update-vals (:databases workspace) present-workspace-instance-database)})

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/current" :- [:maybe WorkspaceInstance]
  "Read-only summary of the workspace loaded on this instance.

  Reads from the `workspace-instance` setting populated at boot by the `:workspace`
  section of `config.yml`, or at runtime by `POST /current`. Returns `nil` when no
  workspace was loaded — i.e. this is a manager-only instance, or no `config.yml`
  was present at boot and `POST /current` hasn't been called."
  []
  (api/check-superuser)
  (when-let [workspace (ws/instance-workspace)]
    (present-workspace-instance workspace)))

(api.macros/defendpoint :post "/current" :- WorkspaceInstance
  "Install a workspace config on this instance at runtime. Accepts the same shape
  `GET /current` returns and persists it via the `workspace-instance` setting so
  it survives restarts. Use this on a running instance to enter workspace mode
  without restarting from `config.yml`."
  [_route-params
   _query-params
   ;; Use the canonical schema so the `:decode/json` transformer coerces the
   ;; `:databases` map keys from JSON strings back into integer Database ids
   ;; before validation and storage.
   body :- ::ws.oss/workspace-instance-config]
  (api/check-superuser)
  (ws/set-instance-workspace! body)
  (present-workspace-instance (ws/instance-workspace)))

(api.macros/defendpoint :delete "/current" :- :nil
  "Clear the workspace config on this instance. After this returns, the instance
  is no longer in workspace mode and `GET /current` returns `nil`."
  []
  (api/check-superuser)
  (ws/clear-instance-workspace!)
  nil)

(api.macros/defendpoint :post "/setup" :- WorkspaceInstance
  "Bootstrap workspace mode on this instance from an uploaded `config.yml`. The
  file must include `:databases` (each `{:name, :engine, :details}`) and a
  `:workspace` section (`{:name, :databases {<db-name> {:input_schemas, :output_namespace}}}`);
  any other sections are ignored. Upserts each database by `(name, engine)`, then
  resolves the workspace map and writes the `workspace-instance` setting. The
  whole thing runs in one application-database transaction.

  Unlike the boot-time `config.yml` loader, this endpoint deliberately performs
  **no template / env-var expansion** — the file's values are inserted verbatim."
  {:multipart true}
  [_route-params
   _query-params
   _body
   {{config "config"} :multipart-params, :as _request}
   :- [:map
       [:multipart-params
        [:map
         ["config" [:map
                    [:filename :string]
                    [:tempfile (ms/InstanceOfClass java.io.File)]]]]]]]
  (api/check-superuser)
  (let [tempfile (:tempfile config)]
    (try
      (let [parsed    (yaml/from-file tempfile)
            databases (api/check-400 (not-empty (get-in parsed [:config :databases])))
            workspace (api/check-400 (not-empty (get-in parsed [:config :workspace])))]
        (t2/with-transaction [_conn]
          (run! ws/upsert-database! databases)
          (ws/set-instance-workspace! (ws/build-instance-config workspace))))
      (finally
        (io/delete-file tempfile :silently))))
  (present-workspace-instance (ws/instance-workspace)))

(api.macros/defendpoint :get "/table-remappings" :- [:sequential TableRemapping]
  "Return all table remappings, ordered by id."
  []
  (api/check-superuser)
  (mapv present-remapping (ws/list-remappings)))
