(ns metabase-enterprise.mcp.settings
  "Enterprise-only settings for per-group MCP tool access."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting mcp-advanced-permissions
  (deferred-tru "Whether MCP tool access is set per group instead of for All Users only.")
  :type       :boolean
  :default    false
  :visibility :admin
  :encryption :no
  ;; Only the mode switch in `metabase-enterprise.mcp.api.permissions` may write it: it reshapes the group rows to
  ;; match, and a bare write through the settings API or a serdes import would leave rows neither mode describes.
  :setter     :none
  :export?    false
  :feature    :ai-controls)
