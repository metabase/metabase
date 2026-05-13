(ns metabase-enterprise.workspaces.api.workspace-instance
  "EE API endpoints for the workspace loaded on this (child) instance, served under
   `/api/ee/workspace-instance`. Read-only — see [[metabase-enterprise.workspaces.api.workspace-manager]]
   for admin operations."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]))

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
   [:databases [:map-of :int WorkspaceInstanceDatabase]]])

(def ^:private TableRemapping
  [:map
   [:id              ms/PositiveInt]
   [:database_id     ms/PositiveInt]
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

  Reads from the in-process atom populated at boot by the `:workspace` section of
  `config.yml`. Returns `nil` when no workspace was loaded — i.e. this is a manager-only
  instance, or no `config.yml` was present at boot."
  []
  (api/check-superuser)
  (when-let [workspace (ws/instance-workspace)]
    (present-workspace-instance workspace)))

(api.macros/defendpoint :get "/table-remappings" :- [:sequential TableRemapping]
  "Return all table remappings, ordered by id."
  []
  (api/check-superuser)
  (mapv present-remapping (ws/list-remappings)))
