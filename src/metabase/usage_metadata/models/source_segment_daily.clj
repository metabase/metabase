(ns metabase.usage-metadata.models.source-segment-daily
  (:require
   [metabase.models.interface :as mi]
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/SourceSegmentDaily [_model] :source_segment_daily)

(t2/deftransforms :model/SourceSegmentDaily
  {:source_type    mi/transform-keyword
   :ownership_mode mi/transform-keyword})

(derive :model/SourceSegmentDaily :metabase/model)
