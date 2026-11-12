(ns metabase-enterprise.dependencies.models.analysis-finding-status
  "The AnalysisFindingStatus model: one status per analyzable entity, marked stale by the writes the analysis reads."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AnalysisFindingStatus [_model] :analysis_finding_status)

(derive :model/AnalysisFindingStatus :metabase/model)

(t2/deftransforms :model/AnalysisFindingStatus
  {:entity_type mi/transform-keyword})
