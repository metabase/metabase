(ns metabase-enterprise.dependencies.models.analysis-finding
  (:require
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AnalysisFinding [_model] :analysis_finding)

(derive :model/AnalysisFinding :metabase/model)

(defn- analysis-finding-details-out [finding]
  (some->> (mi/json-out-with-keywordization finding)
           (into #{} (map #(lib.normalize/normalize :metabase.lib.schema.validate/error %)))))

(t2/deftransforms :model/AnalysisFinding
  {:analyzed_entity_type mi/transform-keyword
   :finding_details {:in  mi/json-in
                     :out analysis-finding-details-out}})

(def ^:dynamic *current-analysis-finding-version*
  "Current version of the query validation logic.
  This should be incremented when the analysis logic changes.
  The background task will re-analyze anything with out-of-date analyses.

  This generally shouldn't be rebound in real code, but making it dynamic is convenient for testing"
  4)

(defn upsert-analysis!
  "Given the details of an AnalysisFinding row, upsert the data into the actual db."
  [type instance-id result finding-details]
  (let [update {:analyzed_at (mi/now)
                :analysis_version *current-analysis-finding-version*
                :result result
                :finding_details finding-details}
        existing-id (t2/select-one-fn :id [:model/AnalysisFinding :id]
                                      :analyzed_entity_type type
                                      :analyzed_entity_id instance-id)]
    (if existing-id
      (t2/update! :model/AnalysisFinding existing-id update)
      (t2/insert! :model/AnalysisFinding
                  (assoc update
                         :analyzed_entity_type type
                         :analyzed_entity_id instance-id)))))

(defn instances-for-analysis
  "Find a batch of instances with missing or outdated AnalysisFindings"
  [type batch-size]
  (let [model (deps.dependency-types/dependency-type->model type)
        table-name (t2/table-name model)
        id-field   (keyword (name table-name) "id")
        table-wildcard   (keyword (name table-name) "*")]
    (t2/select model
               {:select [table-wildcard]
                :from table-name
                :left-join [:analysis_finding [:and
                                               [:= :analysis_finding.analyzed_entity_id id-field]
                                               [:= :analysis_finding.analyzed_entity_type (name type)]]]
                :where [:<
                        [:coalesce :analysis_finding.analysis_version 0]
                        *current-analysis-finding-version*]
                :limit batch-size})))
