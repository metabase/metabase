(ns metabase-enterprise.mcp.tools.execution
  "MCP tools for running transforms, validating, and merging workspaces."
  (:require
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.merge :as ws.merge]
   [metabase-enterprise.workspaces.validation :as ws.validation]
   [metabase.api.common :as api]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "run_workspace_transforms"
                           :description  "Run transforms in a workspace. By default runs all transforms in dependency order.
                  Optionally specify ref_ids to run specific transforms.
                  Returns per-transform status (succeeded/failed) and error messages."
                           :annotations  {"readOnlyHint" false}
                           :input-schema {:type       "object"
                                          :properties {"workspace_id" {:type "integer" :description "Workspace ID"}
                                                       "ref_ids"      {:type  "array"
                                                                       :items {:type "string"}
                                                                       :description "Optional: specific transform ref_ids to run. Omit to run all."}
                                                       "stale_only"   {:type "boolean" :description "Only run stale transforms (default false)"}}
                                          :required   ["workspace_id"]}
                           :handler
                           (fn [{:strs [workspace_id ref_ids stale_only]}]
                             (let [workspace (t2/select-one :model/Workspace workspace_id)
                                   _         (api/check-404 workspace)
                                   _         (api/check-400 (= :ready (:db_status workspace))
                                                            "Workspace database not ready")
                                   graph     (ws.impl/get-or-calculate-graph! workspace)
                                   result    (if (seq ref_ids)
                                               (let [transforms (t2/select :model/WorkspaceTransform
                                                                           :workspace_id workspace_id
                                                                           :ref_id [:in ref_ids])]
                                                 (reduce (fn [acc tx]
                                                           (let [r (ws.impl/run-transform! workspace graph tx)]
                                                             (update acc (if (= :succeeded (:status r)) :succeeded :failed)
                                                                     conj (:ref_id tx))))
                                                         {:succeeded [] :failed []}
                                                         transforms))
                                               (ws.impl/execute-workspace! workspace graph {:stale-only? (boolean stale_only)}))]
                               {:content [{:type "text" :text (json/encode result)}]}))})

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "get_problems"
                           :description  "Check for validation problems that would block merging.
                  Returns problems with severity, whether they block merge, and affected transforms.
                  Run this before merge_workspace to see if there are issues."
                           :annotations  {"readOnlyHint" true}
                           :input-schema {:type       "object"
                                          :properties {"workspace_id" {:type "integer" :description "Workspace ID"}}
                                          :required   ["workspace_id"]}
                           :handler
                           (fn [{:strs [workspace_id]}]
                             (let [workspace (t2/select-one :model/Workspace workspace_id)
                                   _         (api/check-404 workspace)
                                   graph     (ws.impl/get-or-calculate-graph! workspace)
                                   problems  (ws.validation/find-downstream-problems workspace_id graph)
                                   blockers  (filter :block_merge problems)]
                               {:content [{:type "text"
                                           :text (json/encode {:problems      problems
                                                               :merge_blocked (boolean (seq blockers))
                                                               :blocker_count (count blockers)})}]}))})

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "merge_workspace"
                           :description  "Merge all transforms in the workspace to production.
                  Creates/updates/deletes global transforms based on workspace state.
                  Requires a commit_message describing the changes.
                  Will fail if there are merge-blocking problems — use get_problems first."
                           :annotations  {"readOnlyHint" false "destructiveHint" true}
                           :input-schema {:type       "object"
                                          :properties {"workspace_id"   {:type "integer" :description "Workspace ID"}
                                                       "commit_message" {:type "string" :description "Description of changes being merged"}}
                                          :required   ["workspace_id" "commit_message"]}
                           :handler
                           (fn [{:strs [workspace_id commit_message]}]
                             (let [workspace (t2/select-one :model/Workspace workspace_id)
                                   _         (api/check-404 workspace)
                                   graph     (ws.impl/get-or-calculate-graph! workspace)
                                   problems  (ws.validation/find-downstream-problems workspace_id graph)
                                   blockers  (filter :block_merge problems)]
                               (when (seq blockers)
                                 (api/check-400 false (str "Cannot merge: " (count blockers) " blocking problems. Use get_problems to see details.")))
                               (let [result (ws.merge/merge-workspace! workspace api/*current-user-id* commit_message)]
                                 {:content [{:type "text"
                                             :text (json/encode {:merged       true
                                                                 :workspace_id workspace_id
                                                                 :transforms   (get-in result [:merged :transforms])
                                                                 :errors       (:errors result)})}]})))})
