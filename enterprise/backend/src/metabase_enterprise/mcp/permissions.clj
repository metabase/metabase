(ns metabase-enterprise.mcp.permissions
  "Enterprise implementation of per-group MCP tool access: collects the `mcp_group_permission` rows of a user's
  groups into their effective policy."
  (:require
   [metabase-enterprise.mcp.db :as mcp.db]
   [metabase-enterprise.mcp.settings :as mcp.settings]
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(defenterprise effective-policy
  "The effective MCP policy of the User with `user-id`: the `tool_access` of each of their groups that enables MCP,
  so a tool is allowed when any of those groups resolves it to yes. Rows of groups the active permission mode
  (`mcp-advanced-permissions`) hides are ignored."
  :feature :ai-controls
  [user-id]
  (into []
        (comp (filter :mcp_enabled)
              (map :tool_access))
        (mcp.db/visible-group-permissions-for-user user-id (mcp.settings/mcp-advanced-permissions))))
