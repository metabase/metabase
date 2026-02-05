(ns metabase-enterprise.mcp.tools.transforms
  "MCP tools for creating and managing transforms within a workspace."
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase.api.common :as api]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "create_transforms"
                           :description  "Create one or more SQL transforms in a workspace. Each transform needs a name, SQL definition, and target table.
                  The workspace will be initialized on first transform if needed.

                  Example transform:
                  {\"name\": \"customer_lifetime_value\",
                   \"source\": {\"type\": \"sql\", \"query\": {\"database\": 1, \"native\": {\"query\": \"SELECT ...\"}}},
                   \"target\": {\"database\": 1, \"schema\": \"public\", \"name\": \"customer_lifetime_value\"}}"
                           :annotations  {"readOnlyHint" false}
                           :input-schema {:type       "object"
                                          :properties {"workspace_id" {:type "integer" :description "Workspace ID"}
                                                       "transforms"   {:type  "array"
                                                                       :items {:type       "object"
                                                                               :properties {"name"   {:type "string"}
                                                                                            "source" {:type "object" :description "Transform source (type, query)"}
                                                                                            "target" {:type "object" :description "Transform target (database, schema, name)"}}
                                                                               :required   ["name" "source" "target"]}}}
                                          :required   ["workspace_id" "transforms"]}
                           :handler
                           (fn [{:strs [workspace_id transforms]}]
                             (let [workspace (t2/select-one :model/Workspace workspace_id)
                                   _         (api/check-404 workspace)
                                   results   (mapv (fn [tx-def]
                                                     (try
                                                       (let [kw-def (walk/keywordize-keys tx-def)
                                                             tx     (ws.common/add-to-changeset!
                                                                     api/*current-user-id*
                                                                     workspace
                                                                     :transform
                                                                     nil ;; no global_id for new transforms
                                                                     kw-def)]
                                                         {:ref_id (:ref_id tx) :name (:name tx) :status "created"})
                                                       (catch Exception e
                                                         {:name (or (get tx-def "name") (:name tx-def))
                                                          :status "error" :error (ex-message e)})))
                                                   transforms)]
                               {:content [{:type "text" :text (json/encode results)}]}))})

(defn- create-transform-in-workspace!
  "Helper to create a single transform in a workspace. Returns the result map."
  [workspace tx-def]
  (try
    (let [tx (ws.common/add-to-changeset!
              api/*current-user-id*
              workspace
              :transform
              nil
              tx-def)]
      {:ref_id (:ref_id tx) :name (:name tx) :status "created"})
    (catch Exception e
      {:name (:name tx-def) :status "error" :error (ex-message e)})))

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "create_workspace_sql_transform"
                           :description  "Create a SQL transform in a workspace (draft). This creates a workspace-local transform
                  that can be tested and iterated on before merging to production.
                  The database is inferred from the workspace — no need to specify it."
                           :annotations  {"readOnlyHint" false}
                           :input-schema {:type       "object"
                                          :properties {"workspace_id"  {:type "integer" :description "Workspace ID"}
                                                       "name"          {:type "string"  :description "Transform name (e.g. customer_lifetime_value)"}
                                                       "query"         {:type "string"  :description "SQL query string (e.g. SELECT customer_id, SUM(total) ...)"}
                                                       "target_table"  {:type "string"  :description "Target table name for the output"}
                                                       "target_schema" {:type "string"  :description "Target schema (default: public)"}}
                                          :required   ["workspace_id" "name" "query" "target_table"]}
                           :handler
                           (fn [{:strs [workspace_id name query target_table target_schema]}]
                             (let [workspace (t2/select-one :model/Workspace workspace_id)
                                   _         (api/check-404 workspace)
                                   db-id     (:database_id workspace)
                                   tx-def    {:name   name
                                              :source {:type  "query"
                                                       :query {:database db-id
                                                               :type     "native"
                                                               :native   {:query query}}}
                                              :target {:database db-id
                                                       :schema   (or target_schema "public")
                                                       :name     target_table}}
                                   result    (create-transform-in-workspace! workspace tx-def)]
                               {:content [{:type "text" :text (json/encode result)}]}))})

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "create_workspace_python_transform"
                           :description  "Create a Python transform in a workspace (draft). This creates a workspace-local transform
                  that can be tested and iterated on before merging to production.
                  Provide the Python code, source tables it reads from, and a target table name.
                  The database is inferred from the workspace."
                           :annotations  {"readOnlyHint" false}
                           :input-schema {:type       "object"
                                          :properties {"workspace_id"  {:type "integer" :description "Workspace ID"}
                                                       "name"          {:type "string"  :description "Transform name (e.g. customer_segments)"}
                                                       "code"          {:type "string"  :description "Python code string"}
                                                       "source_tables" {:type "object"  :description "Map of logical name to Metabase table ID, e.g. {\"orders\": 42, \"customers\": 43}"}
                                                       "target_table"  {:type "string"  :description "Target table name for the output"}
                                                       "target_schema" {:type "string"  :description "Target schema (default: public)"}}
                                          :required   ["workspace_id" "name" "code" "source_tables" "target_table"]}
                           :handler
                           (fn [{:strs [workspace_id name code source_tables target_table target_schema]}]
                             (let [workspace (t2/select-one :model/Workspace workspace_id)
                                   _         (api/check-404 workspace)
                                   db-id     (:database_id workspace)
                                   tx-def    {:name   name
                                              :source {:type           "python"
                                                       :body           code
                                                       :source-database db-id
                                                       :source-tables  source_tables}
                                              :target {:database db-id
                                                       :schema   (or target_schema "public")
                                                       :name     target_table}}
                                   result    (create-transform-in-workspace! workspace tx-def)]
                               {:content [{:type "text" :text (json/encode result)}]}))})

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "list_transforms"
                           :description  "List transforms in a workspace with their status, last run info, and staleness."
                           :annotations  {"readOnlyHint" true}
                           :input-schema {:type       "object"
                                          :properties {"workspace_id" {:type "integer" :description "Workspace ID"}}
                                          :required   ["workspace_id"]}
                           :handler
                           (fn [{:strs [workspace_id]}]
                             (let [transforms (t2/select [:model/WorkspaceTransform
                                                          :ref_id :name :source :target
                                                          :last_run_status :last_run_at :last_run_message
                                                          :definition_changed :input_data_changed :archived_at]
                                                         :workspace_id workspace_id
                                                         {:order-by [[:created_at :asc]]})]
                               {:content [{:type "text"
                                           :text (json/encode (mapv #(select-keys % [:ref_id :name :last_run_status :last_run_at
                                                                                     :last_run_message :definition_changed
                                                                                     :input_data_changed :archived_at])
                                                                    transforms))}]}))})

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "get_transform"
                           :description  "Get full details of a single transform including its SQL source."
                           :annotations  {"readOnlyHint" true}
                           :input-schema {:type       "object"
                                          :properties {"workspace_id" {:type "integer" :description "Workspace ID"}
                                                       "ref_id"       {:type "string" :description "Transform ref_id"}}
                                          :required   ["workspace_id" "ref_id"]}
                           :handler
                           (fn [{:strs [workspace_id ref_id]}]
                             (let [transform (t2/select-one :model/WorkspaceTransform
                                                            :workspace_id workspace_id
                                                            :ref_id ref_id)]
                               (api/check-404 transform)
                               {:content [{:type "text"
                                           :text (json/encode (select-keys transform [:ref_id :name :source :target
                                                                                      :last_run_status :last_run_at :last_run_message
                                                                                      :definition_changed :input_data_changed]))}]}))})

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "delete_transform"
                           :description  "Archive a transform in the workspace (soft delete). If the transform was checked out from a global transform, merging will delete the global version."
                           :annotations  {"readOnlyHint" false "destructiveHint" true}
                           :input-schema {:type       "object"
                                          :properties {"workspace_id" {:type "integer" :description "Workspace ID"}
                                                       "ref_id"       {:type "string" :description "Transform ref_id"}}
                                          :required   ["workspace_id" "ref_id"]}
                           :handler
                           (fn [{:strs [workspace_id ref_id]}]
                             (let [transform (t2/select-one :model/WorkspaceTransform
                                                            :workspace_id workspace_id
                                                            :ref_id ref_id)]
                               (api/check-404 transform)
                               (t2/update! :model/WorkspaceTransform
                                           {:workspace_id workspace_id :ref_id ref_id}
                                           {:archived_at :%now})
                               (ws.impl/increment-graph-version! workspace_id)
                               {:content [{:type "text" :text (json/encode {:deleted true :ref_id ref_id})}]}))})
