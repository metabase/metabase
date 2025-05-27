(ns metabase-enterprise.scim.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting scim-enabled
  (deferred-tru "Is SCIM currently enabled?")
  :visibility :admin
  :type       :boolean
  :audit      :getter
  :export?    false)

(defsetting scim-base-url
  (deferred-tru "Base URL for SCIM endpoints")
  :visibility :admin
  :type       :string
  :setter     :none
  :audit      :never
  :export?    false
  :getter     (fn []
                (str (system/site-url) "/api/ee/scim/v2")))
