(ns metabase.public-sharing.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n-be.core :as i18n-be]))

(defsetting enable-public-sharing
  (i18n-be/deferred-tru "Enable admins to create publicly viewable links (and embeddable iframes) for Questions and Dashboards?")
  :type       :boolean
  :default    true
  :visibility :authenticated
  :audit      :getter)
