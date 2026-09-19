(ns metabase.mcp.models.mcp-group-permission
  "Toucan 2 model registration for `:model/McpGroupPermission`: one row per permissions group holding whether its
  members may connect to the MCP server and, per tool name, the admin's explicit `\"yes\"` or `\"no\"`."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/McpGroupPermission [_model] :mcp_group_permission)

(doto :model/McpGroupPermission
  (derive :metabase/model)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/McpGroupPermission
  {:tool_access mi/transform-json-no-keywordization})
