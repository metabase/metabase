(ns metabase-enterprise.mcp.tools.workspace
  "MCP tools for workspace lifecycle: create, list, inspect, archive."
  (:require
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.models.workspace :as ws.models]
   [metabase-enterprise.workspaces.validation :as ws.validation]
   [metabase.api.common :as api]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "list_workspaces"
                           :description  "List all workspaces. Returns workspace ID, name, status, database, and transform count."
                           :annotations  {"readOnlyHint" true}
                           :input-schema {:type       "object"
                                          :properties {"database_id" {:type "integer" :description "Filter by database ID (optional)"}}
                                          :required   []}
                           :handler      (fn [{:strs [database_id]}]
                                           (let [workspaces (cond->> (t2/select [:model/Workspace :id :name :base_status :db_status :database_id :created_at]
                                                                                {:where [:not= :base_status "archived"]})
                                                              database_id (filter #(= database_id (:database_id %))))]
                                             {:content [{:type "text"
                                                         :text (json/encode (mapv #(select-keys % [:id :name :base_status :db_status :database_id])
                                                                                  workspaces))}]}))})

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "create_workspace"
                           :description  "Create a new isolated workspace for editing transforms. Returns the workspace ID."
                           :annotations  {"readOnlyHint" false}
                           :input-schema {:type       "object"
                                          :properties {"name"        {:type "string" :description "Workspace name"}
                                                       "database_id" {:type "integer" :description "Target database ID"}}
                                          :required   ["database_id"]}
                           :handler      (fn [{:strs [name database_id]}]
                                           (let [ws (ws.common/create-workspace! api/*current-user-id*
                                                                                 {:name name :database_id database_id})]
                                             {:content [{:type "text"
                                                         :text (json/encode (select-keys ws [:id :name :base_status :db_status :database_id]))}]}))})

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "get_workspace_state"
                           :description  "Get compact workspace state: status, transforms with run status, and validation problems. Use this to understand the current state before making changes."
                           :annotations  {"readOnlyHint" true}
                           :input-schema {:type       "object"
                                          :properties {"workspace_id" {:type "integer" :description "Workspace ID"}}
                                          :required   ["workspace_id"]}
                           :handler      (fn [{:strs [workspace_id]}]
                                           (let [workspace  (t2/select-one :model/Workspace workspace_id)
                                                 _          (api/check-404 workspace)
                                                 transforms (t2/select [:model/WorkspaceTransform
                                                                        :ref_id :name :last_run_status :last_run_at
                                                                        :definition_changed :archived_at]
                                                                       :workspace_id workspace_id)
                                                 graph      (when (= :ready (:db_status workspace))
                                                              (ws.impl/get-or-calculate-graph! workspace))
                                                 problems   (when graph
                                                              (ws.validation/find-downstream-problems workspace_id graph))]
                                             {:content [{:type "text"
                                                         :text (json/encode {:workspace  (select-keys workspace [:id :name :base_status :db_status :database_id])
                                                                             :transforms (mapv #(select-keys % [:ref_id :name :last_run_status :last_run_at
                                                                                                                :definition_changed :archived_at])
                                                                                               transforms)
                                                                             :problems   (or problems [])})}]}))})

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "archive_workspace"
                           :description  "Archive a workspace. Cleans up database isolation resources. The workspace can be unarchived later."
                           :annotations  {"readOnlyHint" false "destructiveHint" true}
                           :input-schema {:type       "object"
                                          :properties {"workspace_id" {:type "integer" :description "Workspace ID"}}
                                          :required   ["workspace_id"]}
                           :handler      (fn [{:strs [workspace_id]}]
                                           (let [workspace (t2/select-one :model/Workspace workspace_id)]
                                             (api/check-404 workspace)
                                             (ws.models/archive! workspace)
                                             {:content [{:type "text"
                                                         :text (json/encode {:archived true :workspace_id workspace_id})}]}))})
