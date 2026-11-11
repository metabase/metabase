(ns metabase.usage-metadata.models.source-segment-composite-daily
  (:require
   [metabase.models.interface :as mi]
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/SourceSegmentCompositeDaily [_model] :source_segment_composite_daily)

(t2/deftransforms :model/SourceSegmentCompositeDaily
  {:source_type    mi/transform-keyword
   :ownership_mode mi/transform-keyword})

(derive :model/SourceSegmentCompositeDaily :metabase/model)
