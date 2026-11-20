(ns metabase.transforms.models.transform-job
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.job-run :as transforms.job-run]
   [metabase.transforms.models.transform-tag :as transform-tag]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.serialization :as transforms.serialization]
   [metabase.transforms.write :as transforms.write]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/TransformJob [_model] :transform_job)

(doto :model/TransformJob
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped-on-insert?))

(t2/deftransforms :model/TransformJob
  {:ui_display_type mi/transform-keyword})

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

(t2/define-after-insert :model/TransformJob [job]
  (events/created! :model/TransformJob job)
  (transforms.write/sync-job-trigger! (:id job))
  job)

(t2/define-after-select :model/TransformJob [job]
  (if (nil? (:built_in_type job))
    job
    (merge job (transforms.write/translated-job-name-and-description job))))

;;; ------------------------------------------------- Permissions --------------------------------------------------

(mu/defn- tags-writable? :- :boolean
  "Whether the current user writes every Transform tagged with one of `tag-ids`."
  [tag-ids :- [:maybe [:sequential ms/PositiveInt]]]
  (every? true? (vals (transform-tag/tag-id->writable (set tag-ids)))))

(mu/defn- job-writable? :- :boolean
  "Whether the current user writes a job carrying `tag-ids`."
  [tag-ids :- [:maybe [:sequential ms/PositiveInt]]]
  (boolean
   (or api/*is-superuser?*
       (and (api/entitled-data-analyst?)
            (tags-writable? tag-ids)))))

(defmethod mi/can-create? :model/TransformJob
  [_model instance]
  (job-writable? (:tag_ids instance)))

(defmethod mi/can-update? :model/TransformJob
  [job changes]
  (and (mi/can-write? job)
       (or (not (contains? changes :tag_ids))
           (job-writable? (:tag_ids changes)))))

;;; -------------------------------------------------- Hydration ---------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/TransformJob :can_read]
  [_model k jobs]
  (let [answer (boolean (api/entitled-data-analyst?))]
    (mapv #(vary-meta % assoc k answer) jobs)))

(methodical/defmethod t2/batched-hydrate [:model/TransformJob :can_write]
  [_model k jobs]
  (let [lookup? (and (not api/*is-superuser?*) (api/entitled-data-analyst?) (seq jobs))
        by-tag  (when lookup?
                  (transform-tag/tag-id->writable (into #{} (mapcat :tag_ids) jobs)))]
    (mapv (fn [job]
            (assoc job k (boolean (or api/*is-superuser?*
                                      (and lookup? (every? #(get by-tag % true) (:tag_ids job)))))))
          jobs)))

(mi/define-batched-hydration-method tag-ids
  :tag_ids
  "Hydrate tag IDs for jobs, preserving order defined by position"
  [jobs]
  (when (seq jobs)
    (let [job-ids         (map :id jobs)
          tag-mappings    (group-by :job_id
                                    (transforms.db/job-tag-links job-ids))
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

(mi/define-batched-hydration-method job-tags
  :job_tags
  "Fetch tags for job"
  [jobs]
  (when (seq jobs)
    (let [job-ids      (into #{} (map u/the-id) jobs)
          tag-mappings (group-by :job_id
                                 (transforms.db/job-tag-links job-ids))]
      (for [job jobs]
        (assoc job :job_tags (get tag-mappings (u/the-id job) []))))))

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod events/spec :model/TransformJob
  [_model]
  {:create :event/transform-job-create
   :update :event/transform-job-update
   :delete :event/transform-job-delete})

(defmethod app-db-copy/spec :model/TransformJob [_model]
  {:skip? false})

(defmethod serialization/spec :model/TransformJob [_]
  {:schema              ::transforms.schema/external-transform-job
   :copy                [:entity_id :built_in_type :schedule :ui_display_type]
   :skip                [:active]
   :transform           {:name        transforms.serialization/string-transform
                         :description transforms.serialization/string-transform}
   :children            {:job_tags :model/TransformJobTransformTag}
   :before-load         transforms.serialization/transform-job-before-load
   :storage-paths       transforms.serialization/transform-job-storage-paths
   :import-dependencies transforms.serialization/transform-job-import-dependencies})
