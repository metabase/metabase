(ns metabase-enterprise.dependencies.models.analysis-finding-status
  "The AnalysisFindingStatus model: one status per analyzable entity, marked stale by the writes the analysis reads."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AnalysisFindingStatus [_model] :analysis_finding_status)

(derive :model/AnalysisFindingStatus :metabase/model)

(defmethod app-db-copy/spec :model/AnalysisFindingStatus [_model]
  {:skip? true})

(t2/deftransforms :model/AnalysisFindingStatus
  {:entity_type mi/transform-keyword})
