(ns metabase.usage-metadata.models.source-metric-daily
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SourceMetricDaily [_model] :source_metric_daily)

(t2/deftransforms :model/SourceMetricDaily
  {:source_type    mi/transform-keyword
   :ownership_mode mi/transform-keyword
   :agg_type       mi/transform-keyword
   :temporal_unit  mi/transform-keyword})

(derive :model/SourceMetricDaily :metabase/model)
