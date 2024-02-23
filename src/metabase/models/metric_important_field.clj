(ns metabase.models.metric-important-field
  "Intersection table for `Metric` and `Field`; this is used to keep track of the top 0-3 important fields for a metric as shown in the Getting Started guide."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def MetricImportantField
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/LegacyMetricImportantField)

(methodical/defmethod t2/table-name :model/LegacyMetricImportantField [_model] :metric_important_field)

(doto :model/LegacyMetricImportantField
  (derive :metabase/model)
  (derive ::mi/read-policy.always-allow)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/LegacyMetricImportantField
 {:definition mi/transform-json})
