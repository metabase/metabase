(ns metabase-enterprise.metabot-v3.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting ai-service-base-url
  (deferred-tru "URL for the a AI Service")
  :type       :string
  :encryption :no
  :default    "http://localhost:8000"
  :visibility :internal
  :export?    false
  :doc        false)

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

(defsetting metabot-id
  (deferred-tru "Override Metabot ID for agent streaming requests.")
  :type       :string
  :visibility :internal
  :feature    :metabot-v3
  :encryption :no
  :export?    false
  :doc        false)

(defsetting ai-service-profile-id
  (deferred-tru "Override Metabot profile ID for agent streaming requests.")
  :type       :string
  :visibility :internal
  :feature    :metabot-v3
  :encryption :no
  :export?    false
  :doc        false)
