(ns metabase.usage-metadata.models.source-dimension-daily
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SourceDimensionDaily [_model] :source_dimension_daily)

(defmethod app-db-copy/spec :model/SourceDimensionDaily [_model]
  {:skip? true})

(t2/deftransforms :model/SourceDimensionDaily
  {:source_type    mi/transform-keyword
   :ownership_mode mi/transform-keyword
   :temporal_unit  mi/transform-keyword})

(derive :model/SourceDimensionDaily :metabase/model)
