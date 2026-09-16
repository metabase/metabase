(ns metabase.mcp-client.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting mcp-client-allowed-networks
  (deferred-tru (str "Controls which networks Metabase may connect to for external MCP servers. "
                     "Set through the environment only.\n"
                     "Options:\n"
                     "- external-only (default; only globally reachable public addresses)\n"
                     "- allow-private (external + private networks but NOT loopback or link-local)\n"
                     "- allow-all (no restrictions)."))
  :type       :keyword
  ;; a settings manager is who this policy defends against, so it cannot be set through the API
  :visibility :internal
  :setter     :none
  :default    :external-only
  :export?    false)
