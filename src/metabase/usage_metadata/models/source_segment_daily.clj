(ns metabase.usage-metadata.models.source-segment-daily
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SourceSegmentDaily [_model] :source_segment_daily)

(t2/deftransforms :model/SourceSegmentDaily
  {:source_type    mi/transform-keyword
   :ownership_mode mi/transform-keyword})

(derive :model/SourceSegmentDaily :metabase/model)
