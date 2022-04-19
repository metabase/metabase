(ns metabase.models.metric-important-field
  "Intersection table for `Metric` and `Field`; this is used to keep track of the top 0-3 important fields for a metric as shown in the Getting Started guide."
  (:require [metabase.models.interface :as mi]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel MetricImportantField :metric_important_field)

(u/strict-extend (class MetricImportantField)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:definition :json})})
  mi/IObjectPermissions
  (merge mi/IObjectPermissionsDefaults
         {:can-read?  (constantly true)
          :can-write? mi/superuser?}))
