(ns metabase-enterprise.oauth-server.core
  (:require
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise all-agent-scopes
  "EE: derives scopes from agent API endpoint metadata."
  :feature :metabot-v3
  []
  (vec (mcp.tools/all-tool-scopes)))
