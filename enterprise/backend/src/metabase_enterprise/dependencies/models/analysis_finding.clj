(ns metabase-enterprise.dependencies.models.analysis-finding
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def current-analysis-version
  "Current version of the analysis logic.
  This should be incremented when the analysis logic changes.
  The background task will re-analyze anything with out-of-date analyses."
  1)

(methodical/defmethod t2/table-name :model/AnalysisFinding [_model] :analysis_finding)

(derive :model/AnalysisFinding :metabase/model)

(t2/deftransforms :model/AnalysisFinding
  {:analyzed_entity_type mi/transform-keyword
   :result               mi/transform-keyword})
