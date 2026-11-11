(ns metabase.usage-metadata.models.source-dimension-daily
  (:require
   [metabase.models.interface :as mi]
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/SourceDimensionDaily [_model] :source_dimension_daily)

(t2/deftransforms :model/SourceDimensionDaily
  {:source_type    mi/transform-keyword
   :ownership_mode mi/transform-keyword
   :temporal_unit  mi/transform-keyword})

(derive :model/SourceDimensionDaily :metabase/model)
