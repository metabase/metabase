(ns metabase.models.metric-important-field
  "Intersection table for `Metric` and `Field`; this is used to keep track of the top 0-3 important fields for a metric as shown in the Getting Started guide."
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]))

(i/defentity MetricImportantField :metric_important_field)

(u/strict-extend (class MetricImportantField)
  i/IEntity
  (merge i/IEntityDefaults
         {:types         (constantly {:definition :json, :description :clob})
          :can-read?     (constantly true)
          :can-write?    i/superuser?}))
