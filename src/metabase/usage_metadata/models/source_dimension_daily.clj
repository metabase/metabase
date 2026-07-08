(ns metabase.usage-metadata.models.source-dimension-daily
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SourceDimensionDaily [_model] :source_dimension_daily)

(t2/deftransforms :model/SourceDimensionDaily
  {:source_type    mi/transform-keyword
   :ownership_mode mi/transform-keyword
   :temporal_unit  mi/transform-keyword})

(derive :model/SourceDimensionDaily :metabase/model)
