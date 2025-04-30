(ns metabase.xrays.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :as i18n]))

(defsetting enable-xrays
  (i18n/deferred-tru "Allow users to explore data using X-rays")
  :type       :boolean
  :default    true
  :visibility :authenticated
  :export?    true
  :audit      :getter)

;;; TODO -- not 100% sure if this belongs here or grouped with other `show-homepage` settings like `show-homepage-data`.
;;; If we removed X-Rays as a feature then we would want to remove this Setting. But if we overhauled the homepage we'd
;;; probably want to remove all `show-homepage-*` Settings.
(defsetting show-homepage-xrays
  (i18n/deferred-tru
   (str "Whether or not to display x-ray suggestions on the homepage. They will also be hidden if any dashboards are "
        "pinned. Admins might hide this to direct users to better content than raw data"))
  :type       :boolean
  :default    true
  :visibility :authenticated
  :export?    true
  :audit      :getter)
