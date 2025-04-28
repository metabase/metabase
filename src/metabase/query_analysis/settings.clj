(ns metabase.query-analysis.settings
  (:require
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]))

(defsetting query-analysis-enabled
  (deferred-tru "Whether or not we analyze any queries at all")
  :visibility :admin
  :export?    false
  :default    false
  :type       :boolean)
