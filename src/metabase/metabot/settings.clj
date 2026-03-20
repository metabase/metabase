(ns metabase.metabot.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting metabot-id
  (deferred-tru "Override Metabot ID for agent streaming requests.")
  :type       :string
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)

(defsetting ai-service-profile-id
  (deferred-tru "Override Metabot profile ID for agent streaming requests.")
  :type       :string
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)

(defsetting metabot-enabled?
  (deferred-tru "Whether Metabot is enabled for regular usage.")
  :type       :boolean
  :visibility :public
  :default    true
  :export?    true
  :doc        false)

(defsetting embedded-metabot-enabled?
  (deferred-tru "Whether Metabot is enabled for embedding.")
  :type       :boolean
  :visibility :public
  :default    true
  :export?    true
  :doc        false)

(defsetting use-native-agent
  (deferred-tru "Enable native Clojure agent instead of external Python AI Service.")
  :type       :boolean
  :default    false
  :visibility :internal
  :export?    false
  :doc        false)
