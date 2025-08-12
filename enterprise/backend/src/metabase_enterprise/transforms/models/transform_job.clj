(ns metabase-enterprise.transforms.models.transform-job
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformJob [_model] :transform_job)

(doto :model/TransformJob
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(mi/define-batched-hydration-method tag-ids
  :tag_ids
  "Hydrate tag IDs for jobs"
  [jobs]
  (when (seq jobs)
    (let [job-ids (map :id jobs)
          tag-mappings (group-by :job_id
                                 (t2/select [:transform_job_tags :job_id :tag_id]
                                            :job_id [:in job-ids]))]
      (for [job jobs]
        (assoc job :tag_ids
               (mapv :tag_id (get tag-mappings (:id job) [])))))))