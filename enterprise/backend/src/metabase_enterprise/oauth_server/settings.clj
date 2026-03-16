(ns metabase-enterprise.oauth-server.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting oauth-server-signing-key
  (deferred-tru "Serialized RSA signing key for the embedded OAuth/OIDC provider.")
  :type       :string
  :encryption :when-encryption-key-set
  :sensitive? true
  :visibility :internal
  :feature    :metabot-v3
  :doc        false
  :export?    false)

(defsetting oauth-server-access-token-ttl
  (deferred-tru "Access token time-to-live in seconds for the embedded OAuth server.")
  :type       :integer
  :visibility :internal
  :default    3600
  :feature    :metabot-v3
  :doc        false
  :export?    false
  :audit      :never)

(defsetting oauth-server-id-token-ttl
  (deferred-tru "ID token time-to-live in seconds for the embedded OAuth server.")
  :type       :integer
  :visibility :internal
  :default    3600
  :feature    :metabot-v3
  :doc        false
  :export?    false
  :audit      :never)

(defsetting oauth-server-authorization-code-ttl
  (deferred-tru "Authorization code time-to-live in seconds for the embedded OAuth server.")
  :type       :integer
  :visibility :internal
  :default    600
  :feature    :metabot-v3
  :doc        false
  :export?    false
  :audit      :never)

(defsetting oauth-server-dynamic-registration-enabled
  (deferred-tru "Whether dynamic client registration (RFC 7591) is enabled for the embedded OAuth server.")
  :type       :boolean
  :default    true
  :visibility :internal
  :feature    :metabot-v3
  :doc        false
  :export?    false
  :audit      :getter)
