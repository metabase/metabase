(ns metabase-enterprise.content-diagnostics.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting content-diagnostics-stale-threshold-days
  (deferred-tru "Content inactive beyond this many days is flagged stale by the Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    90
  :type       :positive-integer
  :export?    true
  :doc        false)
