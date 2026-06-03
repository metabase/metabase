(ns metabase.public-sharing.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :as i18n]))

(defsetting enable-public-sharing
  (i18n/deferred-tru "Enable admins to create publicly viewable links (and embeddable iframes) for Questions and Dashboards?")
  :type       :boolean
  :default    true
  :visibility :authenticated
  :audit      :getter)

(defsetting show-public-link-admin-prompt
  (i18n/deferred-tru
   "When enabled, non-admin users without a public link see a prompt to ask an admin to create one.")
  :type       :boolean
  :default    true
  :visibility :authenticated
  :audit      :getter)
