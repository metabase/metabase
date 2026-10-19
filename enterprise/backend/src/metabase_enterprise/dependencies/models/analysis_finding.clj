(ns metabase-enterprise.dependencies.models.analysis-finding
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as deps.analysis-finding-error]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AnalysisFinding [_model] :analysis_finding)

(derive :model/AnalysisFinding :metabase/model)

(t2/deftransforms :model/AnalysisFinding
  {:entity_type mi/transform-keyword})

(t2/define-before-insert :model/AnalysisFinding
  [finding]
  (merge {:analyzed_at (mi/now)} finding))

(t2/define-before-update :model/AnalysisFinding
  [finding]
  (let [changes (t2/changes finding)]
    (cond-> finding
      (and (contains? changes :result) (not (contains? changes :analyzed_at)))
      (assoc :analyzed_at (mi/now)))))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *current-analysis-finding-version*
  "Current version of the query validation logic.
  This should be incremented when the analysis logic changes.
  The background task will re-analyze anything with out-of-date analyses.

  This generally shouldn't be rebound in real code, but making it dynamic is convenient for testing.

  Version history:
  - 3: Initial version
  - 4: Disable naive sql validation
  - 5: Added source entity tracking in analysis_finding_error table
  - 6: Removed validate prefix from error_type in analysis_finding_error
  - 7: Only mark inactive (not missing) field refs in :fields as soft (GHY-3157)
  - 8: Flag MBQL queries whose source-table is missing/inactive (e.g. dropped during sync)"
  8)

(mu/defn- error->finding-error-row :- ::deps.analysis-finding-error/error-input
  "Convert an error from lib/find-bad-refs-with-source to a row for analysis_finding_error table.
   We use `:message` for the error detail if there was an `validation-exception-error`."
  [error :- ::lib.schema.validate/error-with-source]
  {:error-type          (:type error)
   ;; error-detail cannot be longer than 254
   :error-detail        (some-> (or (:name error) (:message error)) (u/truncate 254))
   :source-entity-type  (:source-entity-type error)
   :source-entity-id    (:source-entity-id error)})

(def ^:private FindingDetails
  "The errors an analysis found, as `lib/find-bad-refs-with-source` returns them."
  [:maybe [:set ::lib.schema.validate/error-with-source]])

(mu/defn upsert-analysis!
  "Given the details of an AnalysisFinding row, upsert the data into the actual db.
   Also writes individual errors to the analysis_finding_error table with source information."
  [entity-type     :- :keyword
   entity-id       :- ms/PositiveInt
   result          :- :boolean
   finding-details :- FindingDetails]
  (t2/with-transaction [_conn]
    (dependencies.db/upsert-finding! entity-type entity-id result)
    (deps.analysis-finding-error/replace-errors-for-entity!
     entity-type
     entity-id
     (map error->finding-error-row finding-details))))
