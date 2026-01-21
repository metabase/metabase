(ns metabase-enterprise.dependencies.models.analysis-finding
  (:require
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as deps.analysis-finding-error]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AnalysisFinding [_model] :analysis_finding)

(derive :model/AnalysisFinding :metabase/model)

(t2/deftransforms :model/AnalysisFinding
  {:analyzed_entity_type mi/transform-keyword})

(def ^:dynamic *current-analysis-finding-version*
  "Current version of the query validation logic.
  This should be incremented when the analysis logic changes.
  The background task will re-analyze anything with out-of-date analyses.

  This generally shouldn't be rebound in real code, but making it dynamic is convenient for testing.

  Version history:
  - 3: Initial version
  - 4: Disable naive sql validation
  - 5: Added source entity tracking in analysis_finding_error table
  - 6: Removed validate prefix from error_type in analysis_finding_error"
  6)

(defn- error->finding-error-row
  "Convert an error from lib/find-bad-refs-with-source to a row for analysis_finding_error table.
   We use `:message` for the error detail if there was an `validation-exception-error`."
  [error]
  {:error-type          (:type error)
   :error-detail        (or (:name error) (:message error))
   :source-entity-type  (:source-entity-type error)
   :source-entity-id    (:source-entity-id error)})

(defn upsert-analysis!
  "Given the details of an AnalysisFinding row, upsert the data into the actual db.
   Also writes individual errors to the analysis_finding_error table with source information."
  [type instance-id result finding-details]
  (t2/with-transaction [_conn]
    (let [update {:analyzed_at (mi/now)
                  :analysis_version *current-analysis-finding-version*
                  :result result}
          existing-id (t2/select-one-fn :id [:model/AnalysisFinding :id]
                                        :analyzed_entity_type type
                                        :analyzed_entity_id instance-id)]
      (if existing-id
        (t2/update! :model/AnalysisFinding existing-id update)
        (t2/insert! :model/AnalysisFinding
                    (assoc update
                           :analyzed_entity_type type
                           :analyzed_entity_id instance-id)))
      (deps.analysis-finding-error/replace-errors-for-entity!
       type
       instance-id
       (map error->finding-error-row finding-details)))))

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
