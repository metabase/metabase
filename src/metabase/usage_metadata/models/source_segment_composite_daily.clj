(ns metabase.usage-metadata.models.source-segment-composite-daily
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SourceSegmentCompositeDaily [_model] :source_segment_composite_daily)

(defmethod app-db-copy/spec :model/SourceSegmentCompositeDaily [_model]
  {:skip? true})

(t2/deftransforms :model/SourceSegmentCompositeDaily
  {:source_type    mi/transform-keyword
   :ownership_mode mi/transform-keyword})

(derive :model/SourceSegmentCompositeDaily :metabase/model)
