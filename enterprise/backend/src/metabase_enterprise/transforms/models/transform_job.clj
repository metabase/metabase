(ns metabase-enterprise.transforms.models.transform-job
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase-enterprise.transforms.models.job-run :as transforms.job-run]
   [metabase.models.interface :as mi]
   [metabase.setup.core :as setup]
   [metabase.task.core :as task]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformJob [_model] :transform_job)

(doto :model/TransformJob
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(mi/define-batched-hydration-method tag-ids
  :tag_ids
  "Hydrate tag IDs for jobs, preserving order defined by position"
  [jobs]
  (when (seq jobs)
    (let [job-ids         (map :id jobs)
          tag-mappings    (group-by :job_id
                                    (t2/select [:model/TransformJobTransformTag :job_id :tag_id :position]
                                               :job_id [:in job-ids]
                                               {:order-by [[:position :asc]]}))
          ;; Sort each job's tags by position
          sorted-mappings (update-vals tag-mappings #(sort-by :position %))]
      (for [job jobs]
        (assoc job :tag_ids
               (mapv :tag_id (get sorted-mappings (:id job) [])))))))

(methodical/defmethod t2/batched-hydrate [:model/TransformJob :last_run]
  [_model _k jobs]
  (when (seq jobs)
    (let [job-ids         (into #{} (map :id) jobs)
          last-executions (m/index-by :job_id (transforms.job-run/latest-runs job-ids))]
      (for [job jobs]
        (assoc job :last_run (get last-executions (:id job)))))))

(defn update-job-tags!
  "Update the tags associated with a job using smart diff logic.
   Only modifies what has changed: deletes removed tags, updates positions for moved tags,
   and inserts new tags. Duplicate tag IDs are automatically deduplicated."
  [job-id tag-ids]
  (when job-id
    (t2/with-transaction [_conn]
      (let [;; Deduplicate, just in case
            deduped-tag-ids      (vec (distinct tag-ids))
            ;; Get current associations
            current-associations (t2/select [:model/TransformJobTransformTag :tag_id :position]
                                            :job_id job-id
                                            {:order-by [[:position :asc]]})
            current-tag-ids      (mapv :tag_id current-associations)
            ;; Validate that new tag IDs exist
            valid-tag-ids        (when (seq deduped-tag-ids)
                                   (into #{} (t2/select-fn-set :id :model/TransformTag
                                                               :id [:in deduped-tag-ids])))
            ;; Filter to only valid tags, preserving order
            new-tag-ids          (if valid-tag-ids
                                   (filterv valid-tag-ids deduped-tag-ids)
                                   [])
            ;; Calculate what needs to change
            current-set          (set current-tag-ids)
            new-set              (set new-tag-ids)
            to-delete            (set/difference current-set new-set)
            to-insert            (set/difference new-set current-set)
            ;; Build position map for new ordering
            new-positions        (zipmap new-tag-ids (range))]

        ;; Delete removed associations
        (when (seq to-delete)
          (t2/delete! :model/TransformJobTransformTag
                      :job_id job-id
                      :tag_id [:in to-delete]))

        ;; Update positions for existing tags that moved
        (doseq [tag-id (filter current-set new-tag-ids)]
          (let [new-pos (get new-positions tag-id)]
            (t2/update! :model/TransformJobTransformTag
                        {:job_id job-id :tag_id tag-id}
                        {:position new-pos})))

        ;; Insert new associations with correct positions
        (when (seq to-insert)
          (t2/insert! :model/TransformJobTransformTag
                      (for [tag-id to-insert]
                        {:job_id   job-id
                         :tag_id   tag-id
                         :position (get new-positions tag-id)})))))))

(defn localize-jobs
  "Localize the initial jobs in the transform_job table."
  ([]
   (localize-jobs (i18n/user-locale)))
  ([locale]
   (let [un-localized (t2/select :model/TransformJob :built_in_type [:is-not nil])]
     (when (seq un-localized)
       (log/info (str "Localizing jobs for locale " locale "."))
       (let [values {"hourly"
                     [(i18n/translate locale "Hourly job")
                      (i18n/translate locale "Executes transforms tagged with 'hourly' every hour")]

                     "daily"
                     [(i18n/translate locale "Daily job")
                      (i18n/translate locale "Executes transforms tagged with 'daily' once per day")]

                     "weekly"
                     [(i18n/translate locale "Weekly job")
                      (i18n/translate locale "Executes transforms tagged with 'weekly' once per week")]

                     "monthly"
                     [(i18n/translate locale "Monthly job")
                      (i18n/translate locale "Executes transforms tagged with 'monthly' once per month")]}]
         (doseq [{:keys [built_in_type]} un-localized
                 :let [[name description] (get values built_in_type)]
                 :when name
                 :when (pos? (t2/update! :model/TransformJob
                                         :built_in_type built_in_type
                                         {:name name
                                          :description description
                                          :built_in_type nil}))]
           (log/info (str "Localized " built_in_type " job for locale " locale "."))))))))

(defmethod task/init! ::LocalizeJobs [_]
  (when (setup/has-user-setup)
    (localize-jobs)))
