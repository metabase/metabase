(ns metabase.mcp.models.mcp-view-context
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpViewContext [_model] :mcp_view_context)

(doto :model/McpViewContext
  (derive :metabase/model)
  (derive :hook/timestamped?))
