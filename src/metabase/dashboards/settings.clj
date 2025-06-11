(ns metabase.dashboards.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting dashboards-save-last-used-parameters
  (deferred-tru "Whether dashboards should default to a user''s last used parameters on load.")
  :default true
  :visibility :internal
  :export? true
  :type :boolean)
