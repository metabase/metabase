(ns metabase-enterprise.content-diagnostics.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting content-diagnostics-stale-threshold-days
  (deferred-tru "Content unused beyond this many days is flagged stale by the Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    90
  :type       :positive-integer
  :export?    false
  :doc        false)

(defsetting slow-card-threshold-seconds
  (deferred-tru "Cards whose mean execution time exceeds this many seconds are flagged slow by the Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    15
  :type       :positive-integer
  :export?    false
  :doc        false)

(defsetting slow-transform-threshold-seconds
  (deferred-tru "Transforms whose latest successful run exceeds this many seconds are flagged slow by the Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    300
  :type       :positive-integer
  :export?    false
  :doc        false)
