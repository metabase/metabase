(ns metabase-enterprise.mcp.permissions
  "Enterprise implementation of per-group MCP tool access: collects the `mcp_group_permission` rows of a user's
  groups into their effective policy."
  (:require
   [metabase-enterprise.mcp.db :as mcp.db]
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(defenterprise effective-policy
  "The effective MCP policy of the User with `user-id`: the `tool_access` of each of their groups that enables MCP,
  so a tool is allowed when any of those groups resolves it to yes. The rows alone decide it: each mode switch
  deletes the rows of the groups the new mode hides, so no request reads the mode."
  ;; Enforced without the `:ai-controls` feature too: losing the license (an expired token, a failed token check)
  ;; must not hand MCP back to the groups an admin turned it off for. The feature gates editing the rows, not reading
  ;; them.
  :feature :none
  [user-id]
  (into []
        (comp (filter :mcp_enabled)
              (map :tool_access))
        (mcp.db/group-permissions-for-user user-id)))
