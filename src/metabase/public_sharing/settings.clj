(ns metabase.public-sharing.settings
  (:require
   [metabase.models.setting :refer [defsetting]]
   [metabase.util.i18n :as i18n]))

(defsetting enable-public-sharing
  (i18n/deferred-tru "Enable admins to create publicly viewable links (and embeddable iframes) for Questions and Dashboards?")
  :type       :boolean
  :default    true
  :visibility :authenticated
  :audit      :getter)
