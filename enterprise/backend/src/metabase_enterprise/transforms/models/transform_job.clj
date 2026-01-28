(ns metabase-enterprise.transforms.models.transform-job
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase-enterprise.transforms.models.job-run :as transforms.job-run]
   [metabase-enterprise.transforms.models.transform :as transform]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformJob [_model] :transform_job)

(doto :model/TransformJob
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/TransformJob
  {:ui_display_type mi/transform-keyword})

(defmethod mi/can-read? :model/TransformJob
  ([_instance]
   (or api/*is-superuser?* api/*is-data-analyst?*))
  ([_model _pk]
   (or api/*is-superuser?* api/*is-data-analyst?*)))

(defmethod mi/can-write? :model/TransformJob
  ([instance]
   (or api/*is-superuser?*
       (and api/*is-data-analyst?*
            (let [tag-ids (:tag_ids instance)]
              (if (seq tag-ids)
                (let [transforms (transform/transforms-with-tags tag-ids)]
                  (every? mi/can-write? transforms))
                true)))))
  ([_model pk]
   (when-let [job (t2/select-one :model/TransformJob :id pk)]
     (mi/can-write? job))))

(defmethod mi/can-create? :model/TransformJob
  [_model instance]
  (or api/*is-superuser?*
      (and api/*is-data-analyst?*
           (let [tag-ids (:tag_ids instance)]
             (if (seq tag-ids)
               (let [transforms (transform/transforms-with-tags tag-ids)]
                 (every? mi/can-write? transforms))
               true)))))

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

(defn- translated-name-and-description [job]
  (let [values {"hourly"
                [(i18n/deferred-trs "Hourly job")
                 (i18n/deferred-trs "Executes transforms tagged with ''hourly'' every hour")]

                "daily"
                [(i18n/deferred-trs "Daily job")
                 (i18n/deferred-trs "Executes transforms tagged with ''daily'' once per day")]

                "weekly"
                [(i18n/deferred-trs "Weekly job")
                 (i18n/deferred-trs "Executes transforms tagged with ''weekly'' once per week")]

                "monthly"
                [(i18n/deferred-trs "Monthly job")
                 (i18n/deferred-trs "Executes transforms tagged with ''monthly'' once per month")]}
        [name description] (get values (:built_in_type job))]
    {:name name :description description}))

(t2/define-after-select :model/TransformJob [job]
  (if (nil? (:built_in_type job))
    job
    (merge job (translated-name-and-description job))))

(t2/define-before-update :model/TransformJob [job]
  (if (or mi/*deserializing?* (nil? (:built_in_type job)))
    job
    (-> (merge (translated-name-and-description job) ;; default translations
               {:built_in_type nil}                  ;; never translate again
               (t2/changes job))                     ;; user edits
        (update :name        str) ;; convert deferred to strings
        (update :description str))))

;;; ------------------------------------------------- Serialization ------------------------------------------------

(mi/define-batched-hydration-method job-tags
  :job_tags
  "Fetch tags for job"
  [jobs]
  (when (seq jobs)
    (let [job-ids      (into #{} (map u/the-id) jobs)
          tag-mappings (group-by :job_id
                                 (t2/select :model/TransformJobTransformTag
                                            :job_id [:in job-ids]
                                            {:order-by [[:position :asc]]}))]
      (for [job jobs]
        (assoc job :job_tags (get tag-mappings (u/the-id job) []))))))

(defmethod serdes/hash-fields :model/TransformJob
  [_job]
  [:name :built_in_type])

(defmethod serdes/make-spec "TransformJob"
  [_model-name opts]
  {:copy [:entity_id :built_in_type :schedule :ui_display_type]
   :skip []
   :transform {:name {:export str :import identity}
               :description {:export str :import identity}
               :created_at (serdes/date)
               :job_tags (serdes/nested :model/TransformJobTransformTag :job_id opts)}})

(defmethod serdes/dependencies "TransformJob"
  [{:keys [job_tags]}]
  (set
   (for [{tag-id :tag_id} job_tags]
     [{:model "TransformTag" :id tag-id}])))

(defmethod serdes/storage-path "TransformJob" [job _ctx]
  (let [{:keys [id label]} (-> job serdes/path last)]
    ["transforms" "transform_jobs" (serdes/storage-leaf-file-name id label)]))
