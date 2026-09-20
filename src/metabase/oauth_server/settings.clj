(ns metabase.oauth-server.settings
  (:require
   [metabase.mcp.core :as mcp]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting oauth-server-access-token-ttl
  (deferred-tru "Access token time-to-live in seconds for the embedded OAuth server.")
  :type       :integer
  :visibility :internal
  :default    3600
  :doc        false
  :export?    false
  :audit      :never)

(defsetting oauth-server-authorization-code-ttl
  (deferred-tru "Authorization code time-to-live in seconds for the embedded OAuth server.")
  :type       :integer
  :visibility :internal
  :default    600
  :doc        false
  :export?    false
  :audit      :never)

(defsetting oauth-server-refresh-token-ttl
  (deferred-tru "Refresh token time-to-live in seconds for the embedded OAuth server.")
  :type       :integer
  :visibility :internal
  :default    2592000 ;; 30 days
  :doc        false
  :export?    false
  :audit      :never)

(defsetting oauth-server-rotate-refresh-tokens
  (deferred-tru "Whether each OAuth refresh replaces and revokes the refresh token. Disabling rotation allows reuse until expiry or revocation.")
  :type       :boolean
  :visibility :admin
  :default    true
  :doc        false
  :export?    false
  :audit      :getter)

(defsetting oauth-server-refresh-token-reuse-client-ids
  (deferred-tru "Registered OAuth clients allowed to reuse refresh tokens until expiry or revocation.")
  :type       :csv
  :visibility :admin
  :default    []
  :doc        false
  :export?    false
  :encryption :when-encryption-key-set
  :audit      :getter)

;; Gated on mcp-enabled? so registration is off whenever MCP is; stored override can still force false.
(defsetting oauth-server-dynamic-registration-enabled
  (deferred-tru "Whether dynamic client registration (RFC 7591) is enabled for the embedded OAuth server.")
  :type       :boolean
  :default    true
  :visibility :internal
  :doc        false
  :export?    false
  :audit      :getter
  :getter     #(and (mcp/mcp-enabled?)
                    (setting/get-value-of-type :boolean :oauth-server-dynamic-registration-enabled)))
