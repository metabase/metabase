(ns metabase-enterprise.dependencies.models.analysis-finding
  (:require
   [medley.core :as m]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as deps.analysis-finding-error]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AnalysisFinding [_model] :analysis_finding)

(derive :model/AnalysisFinding :metabase/model)

(t2/deftransforms :model/AnalysisFinding
  {:analyzed_entity_type mi/transform-keyword})

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

(defn- error->finding-error-row
  "Convert an error from lib/find-bad-refs-with-source to a row for analysis_finding_error table.
   We use `:message` for the error detail if there was an `validation-exception-error`."
  [error]
  {:error-type          (:type error)
   ;; error-detail cannot be longer than 254
   :error-detail        (some-> (or (:name error) (:message error)) (u/truncate 254))
   :source-entity-type  (:source-entity-type error)
   :source-entity-id    (:source-entity-id error)})

(defn upsert-analysis!
  "Given the details of an AnalysisFinding row, upsert the data into the actual db, recording `version`, the
  `:seen_updated_at` and `:seen_count` of the entity analyzed, unless it is nil.
   Also writes individual errors to the analysis_finding_error table with source information."
  [type instance-id result finding-details version]
  (t2/with-transaction [_conn]
    (let [update (merge {:analysis_version *current-analysis-finding-version*
                         :result result}
                        version)
          existing-id (dependencies.db/finding-id type instance-id)]
      (if existing-id
        (dependencies.db/update-finding! existing-id update)
        (dependencies.db/insert-finding! (assoc update
                                                :analyzed_entity_type type
                                                :analyzed_entity_id instance-id)))
      (deps.analysis-finding-error/replace-errors-for-entity!
       type
       instance-id
       (map error->finding-error-row finding-details)))))

(defn instances-for-analysis
  "Find a batch of instances of type `entity-type` and maximum size `batch-size` whose AnalysisFinding is missing, was
  analyzed from another version of them, or by an older analysis, as `[instance version]` pairs, each version the
  `:seen_updated_at` and `:seen_count` to record. Prioritizes changed entities over outdated analyses."
  [entity-type batch-size]
  (let [rows      (dependencies.db/entities-for-analysis entity-type batch-size *current-analysis-finding-version*)
        instances (when (seq rows)
                    (m/index-by :id (dependencies.db/instances entity-type (into #{} (map :id) rows))))]
    (into []
          (keep (fn [{:keys [id version_updated_at version_count]}]
                  (when-let [instance (get instances id)]
                    [instance {:seen_updated_at version_updated_at :seen_count version_count}])))
          rows)))
