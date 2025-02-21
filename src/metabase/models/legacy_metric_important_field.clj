(ns metabase.models.legacy-metric-important-field
  "Intersection table for `LegacyMetric` and `Field`; this is used to keep track of the top 0-3 important fields for a
  metric as shown in the Getting Started guide."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/LegacyMetricImportantField [_model] :metric_important_field)

(doto :model/LegacyMetricImportantField
  (derive :metabase/model)
  (derive ::mi/read-policy.always-allow)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/LegacyMetricImportantField
  {:definition mi/transform-json})
