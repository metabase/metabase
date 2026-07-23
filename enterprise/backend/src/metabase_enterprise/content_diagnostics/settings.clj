(ns metabase-enterprise.content-diagnostics.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting content-diagnostics-stale-threshold-days
  (deferred-tru "Content inactive beyond this many days is flagged stale by Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    90
  :type       :positive-integer
  :export?    true
  :doc        false)

(defsetting content-diagnostics-slow-card-threshold-seconds
  (deferred-tru "Cards whose average query time exceeds this are flagged slow by Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    15
  :type       :positive-integer
  :export?    true
  :doc        false)

(defsetting content-diagnostics-slow-transform-threshold-seconds
  (deferred-tru "Transforms whose last run took longer than this are flagged slow by Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    60
  :type       :positive-integer
  :export?    true
  :doc        false)
