(ns metabase.mcp.models.mcp-group-permission
  "Toucan 2 model registration for `:model/McpGroupPermission`: one row per permissions group holding whether its
  members may connect to the MCP server and, per tool name, the admin's explicit `\"yes\"` or `\"no\"`."
  (:require
   [metabase.api.common :as api]
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.permissions :as mcp.perms]
   [metabase.mcp.v2.registry :as registry]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/McpGroupPermission [_model] :mcp_group_permission)

(doto :model/McpGroupPermission
  (derive :metabase/model)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser)
  (derive :hook/timestamped?))

(t2/deftransforms :model/McpGroupPermission
  {:tool_access mi/transform-json-no-keywordization})

(defn- check-tool-access
  "Throw a 400 unless every value in `tool-access` is `\"yes\"` or `\"no\"` and every name is a registered tool, a
  former name of one, or in `stored`, the names the row held before, so an entry for a tool removed since it was saved
  never blocks a save."
  [tool-access stored]
  (api/check-400 (mr/validate ::mcp.perms/tool-access tool-access)
                 (tru "Every MCP tool must be \"yes\" or \"no\""))
  (let [known (into (set (keys (registry/renamed-tool-names))) (map :name) (registry/tool-catalog))]
    (doseq [tool-name (keys tool-access)]
      (api/check-400 (or (known tool-name) (stored tool-name)) (tru "Unknown MCP tool: {0}" tool-name)))))

(defn- check-one-mode
  "Throw a 400 when a row for the group with `group-id` would sit beside rows of the other permission mode: All Users
  and All tenant users have rows only in simple mode, every group but them and Administrators only in group-level
  mode."
  [group-id]
  (let [defaults #{(u/the-id (perms/all-users-group)) (u/the-id (perms/all-external-users-group))}
        admin-id (u/the-id (perms/admin-group))
        simple   (vec (conj defaults admin-id))]
    (cond
      (= admin-id group-id) nil
      (defaults group-id)   (api/check-400 (not (mcp.db/group-permission-exists? [:not-in simple]))
                                           (tru "All Users can''t have an MCP policy while groups have their own"))
      :else                 (api/check-400 (not (mcp.db/group-permission-exists? [:in (vec defaults)]))
                                           (tru "Group {0} can''t have an MCP policy while All Users has one"
                                                (str group-id))))))

(t2/define-before-insert :model/McpGroupPermission
  [{:keys [group_id tool_access] :as row}]
  (check-tool-access tool_access #{})
  (check-one-mode group_id)
  row)

(t2/define-before-update :model/McpGroupPermission
  [row]
  (let [changes (t2/changes row)]
    (when (contains? changes :tool_access)
      (check-tool-access (:tool_access changes) (set (keys (:tool_access (t2/original row))))))
    (when (contains? changes :group_id)
      (check-one-mode (:group_id changes))))
  row)
