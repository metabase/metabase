(ns metabase.oauth-server.settings
  (:require
   [metabase.mcp.core :as mcp]
   [metabase.settings.core :as setting :refer [defsetting]]))

(defsetting oauth-server-access-token-ttl
  "Access token time-to-live in seconds for the embedded OAuth server."
  :type       :integer
  :visibility :internal
  :default    3600
  :doc        false
  :export?    false
  :audit      :never)

(defsetting oauth-server-authorization-code-ttl
  "Authorization code time-to-live in seconds for the embedded OAuth server."
  :type       :integer
  :visibility :internal
  :default    600
  :doc        false
  :export?    false
  :audit      :never)

(defsetting oauth-server-refresh-token-ttl
  "Refresh token time-to-live in seconds for the embedded OAuth server."
  :type       :integer
  :visibility :internal
  :default    2592000 ;; 30 days
  :doc        false
  :export?    false
  :audit      :never)

;; Gated on mcp-enabled? so registration is off whenever MCP is; stored override can still force false.
(defsetting oauth-server-dynamic-registration-enabled
  "Whether dynamic client registration (RFC 7591) is enabled for the embedded OAuth server."
  :type       :boolean
  :default    true
  :visibility :internal
  :doc        false
  :export?    false
  :audit      :getter
  :getter     #(and (mcp/mcp-enabled?)
                    (setting/get-value-of-type :boolean :oauth-server-dynamic-registration-enabled)))
