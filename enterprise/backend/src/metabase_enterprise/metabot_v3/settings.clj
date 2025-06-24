(ns metabase-enterprise.metabot-v3.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting ai-proxy-base-url
  (deferred-tru "URL for the a AI Proxy service")
  :type       :string
  :encryption :no
  :default    "http://localhost:8000"
  :visibility :internal
  :export?    false)

(defsetting site-uuid-for-metabot-tools
  "UUID that we use for encrypting JWT tokens given to the AI service to make callbacks with."
  :encryption :when-encryption-key-set
  :visibility :internal
  :sensitive? true
  :feature    :metabot-v3
  :doc        false
  :export?    false
  :base       setting/uuid-nonce-base)

(defsetting metabot-ai-service-token-ttl
  (deferred-tru "The number of seconds the tokens passed to AI service should be valid.")
  :type       :integer
  :visibility :settings-manager
  :default    180
  :feature    :metabot-v3
  :doc        false
  :export?    true
  :audit      :never)
