(ns metabase.models.metric-important-field
  "Intersection table for `Metric` and `Field`; this is used to keep track of the top 0-3 important fields for a metric as shown in the Getting Started guide."
  (:require [metabase.models.interface :as mi]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel MetricImportantField :metric_important_field)

(doto MetricImportantField
  (derive ::mi/read-policy.always-allow)
  (derive ::mi/write-policy.superuser))

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class MetricImportantField)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:definition :json})}))
