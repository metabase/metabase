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
  :export?    true
  :feature    :ai-controls)
