(ns metabase-enterprise.dependencies.models.analysis-finding
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AnalysisFinding [_model] :analysis_finding)

(derive :model/AnalysisFinding :metabase/model)

(t2/deftransforms :model/AnalysisFinding
  {:analyzed_entity_type mi/transform-keyword
   :finding_details mi/transform-json})

(def ^:dynamic current-analysis-version
  "Current version of the analysis logic.
  This should be incremented when the analysis logic changes.
  The background task will re-analyze anything with out-of-date analyses."
  3)

(defn upsert-analysis! [type instance-id result finding-details]
  (let [update {:analyzed_at (mi/now)
                :analysis_version current-analysis-version
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

(def ^:private table-info
  {:card [:model/Card :report_card :report_card.* :report_card.id]
   :transform [:model/Transform :transform :transform.* :transform.id]})

(defn instances-for-analysis [type batch-size]
  (let [[model table-name table-wildcard table-id] (table-info type)]
    (t2/select model
               {:select [table-wildcard]
                :from table-name
                :left-join [:analysis_finding [:and
                                               [:= :analysis_finding.analyzed_entity_id table-id]
                                               [:= :analysis_finding.analyzed_entity_type (name type)]]]
                :where [:or
                        [:= :analysis_finding.analysis_version nil]
                        [:< :analysis_finding.analysis_version current-analysis-version]]
                :limit batch-size})))

(defn reset-analysis! [type instance-ids]
  (doseq [ids-batch (partition 50 50 nil instance-ids)]
    (t2/update! :model/AnalysisFinding
                :analyzed_entity_id [:in ids-batch]
                :analyzed_entity_type type
                {:analysis_version -1})))
