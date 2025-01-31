(ns metabase-enterprise.scim.settings
  (:require
   [metabase.models.setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
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
                (str (public-settings/site-url) "/api/ee/scim/v2")))
