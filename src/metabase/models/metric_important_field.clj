(ns metabase.models.metric-important-field
  "Intersection table for `Metric` and `Field`; this is used to keep track of the top 0-3 important fields for a metric as shown in the Getting Started guide."
  (:require
   [metabase.models.interface :as mi]
   [toucan.models :as models]))

(models/defmodel MetricImportantField :metric_important_field)

(doto MetricImportantField
  (derive ::mi/read-policy.always-allow)
  (derive ::mi/write-policy.superuser))

(mi/define-methods
 MetricImportantField
 {:types (constantly {:definition :json})})
