(ns metabase.dashboards.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting dashboards-save-last-used-parameters
  "Whether dashboards should default to a user's last used parameters on load."
  :default true
  :visibility :internal
  :export? true
  :type :boolean)
