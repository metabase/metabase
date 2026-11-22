(ns metabase.transforms.models.transform-job
  (:require
   [clojure.set :as set]
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.job-run :as transforms.job-run]
   [metabase.transforms.models.transform-job-transform-tag :as transform-job-transform-tag]
   [metabase.transforms.models.transform-tag :as transform-tag]
   [metabase.transforms.schedule :as transforms.schedule]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.serialization :as transforms.serialization]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/TransformJob [_model] :transform_job)

(doto :model/TransformJob
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/TransformJob
  {:ui_display_type mi/transform-keyword})

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

(mu/defn- translated-name-and-description :- [:map {:closed true}
                                              [:name        [:maybe mu/localized-string-schema]]
                                              [:description [:maybe mu/localized-string-schema]]]
  [job :- (mut/optional-keys ::transforms.schema/transform-job [:id])]
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
  (if (nil? (:built_in_type job))
    job
    (-> (merge job
               (translated-name-and-description job)
               {:built_in_type nil}
               (t2/changes job))
        (update :name        str)
        (update :description str))))

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

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(mu/defn- sync-triggers! :- :nil
  "Make the Quartz trigger of each of the `jobs` match its row: scheduled while the job is active, removed otherwise."
  [jobs :- [:sequential :map]]
  (doseq [{:keys [id active schedule] :as job} jobs]
    (if active
      (when-not (= schedule (:schedule (transforms.schedule/existing-trigger id)))
        (transforms.schedule/initialize-job! job))
      (transforms.schedule/delete-trigger! id)))
  nil)

(mu/defn create-transform-jobs! :- [:sequential ::transforms.schema/transform-job]
  "Insert the TransformJob `rows`, schedule the Quartz trigger of each active one, and return the inserted jobs,
  publishing their create event."
  [rows :- [:sequential ::transforms.schema/transform-job.create]]
  (if (seq rows)
    (t2/with-transaction [_conn]
      (let [jobs (transforms.db/insert-jobs! rows)]
        (sync-triggers! jobs)
        (events/publish-event! :event/transform-job-create (events/create-event jobs))
        jobs))
    []))

(defn- updated-job
  "The TransformJob `stored` as the update `changes` leaves it: a built-in job becomes a custom one that keeps its
  name and description, as the update hook makes it."
  [stored changes]
  (let [object (merge stored changes)]
    (if (nil? (:built_in_type stored))
      object
      (-> (merge object
                 (translated-name-and-description stored)
                 {:built_in_type nil}
                 changes)
          (update :name str)
          (update :description str)))))

(defn- without-built-in-names
  "`rows`, the update rows of an import, without the name and description of those of a built-in job in `stored`."
  [rows stored]
  (mapv (fn [{:keys [id] :as row}]
          (cond-> row
            (and (some? (:built_in_type (stored id))) (not (contains? row :built_in_type)))
            (dissoc :name :description)))
        rows))

(mu/defn update-transform-jobs! :- [:sequential ::transforms.schema/transform-job.update]
  "Apply the changes in each of `rows`, the id of a TransformJob and the columns to change, with one statement per
  distinct change set, then make the Quartz trigger of each job match its row, publishing their update event. An import
  leaves the name and description of a built-in job as they are. Returns `rows`."
  ([rows :- [:sequential ::transforms.schema/transform-job.update]]
   (update-transform-jobs! rows nil))
  ([rows :- [:sequential ::transforms.schema/transform-job.update]
    opts :- ::transforms.schema/write-opts]
   (when (seq rows)
     (t2/with-transaction [_conn]
       (let [ids     (mapv :id rows)
             stored  (u/index-by :id (transforms.db/jobs-by-ids ids))
             changed (cond-> rows
                       (= :import (:writer opts)) (without-built-in-names stored))]
         (doseq [[changes group] (group-by #(dissoc % :id) changed)
                 :when           (seq changes)]
           (transforms.db/update-jobs! (mapv :id group) changes))
         (sync-triggers! (transforms.db/jobs-by-ids ids))
         (events/publish-event! :event/transform-job-update
                                (events/update-event stored
                                                     changed
                                                     (assoc opts :objects (into {}
                                                                                (keep (fn [{:keys [id] :as row}]
                                                                                        (when-let [previous (stored id)]
                                                                                          [id (updated-job previous (dissoc row :id))])))
                                                                                changed)))))))
   (vec rows)))

(mu/defn delete-transform-jobs! :- :nil
  "Delete the Quartz jobs and then the TransformJobs with `job-ids`, publishing their delete event."
  [job-ids :- [:sequential ms/PositiveInt]]
  (when (seq job-ids)
    (t2/with-transaction [_conn]
      (let [jobs (transforms.db/jobs-by-ids (vec job-ids))]
        (run! transforms.schedule/delete-job! job-ids)
        (events/publish-event! :event/transform-job-delete (events/delete-event jobs))
        (transforms.db/delete-jobs! (vec job-ids)))))
  nil)

(mu/defn- flip-active! :- :nil
  "Run `flip!`, one of the db functions that mark a job active or inactive, for the job with `job-id`, and make its Quartz
  trigger match when it changed the row, publishing its update event."
  [flip!  :- fn?
   job-id :- ms/PositiveInt]
  (t2/with-transaction [_conn]
    (when-let [previous (transforms.db/job job-id)]
      (when (pos? (flip! job-id))
        (sync-triggers! [(assoc previous :active (not (:active previous)))])
        (events/publish-event! :event/transform-job-update
                               (events/update-event {job-id previous}
                                                    [{:id job-id :active (not (:active previous))}]
                                                    {:objects {job-id (updated-job previous {:active (not (:active previous))})}})))))
  nil)

(mu/defn- active-flip-lock-name :- :keyword
  "Per-job cluster-lock keyword used to serialize `:active` flips of the same job across the
  cluster. Concurrent flips of *different* jobs run in parallel."
  [job-id :- ms/PositiveInt]
  (keyword "metabase.transforms.transform-job-active" (str job-id)))

(mu/defn activate-job! :- :nil
  "Activate a transform job: set `:active` to true, which creates its Quartz trigger from the
  job's stored schedule so cron firings begin again. Idempotent — calling on an already-active
  job is a no-op.

  Concurrent activate/deactivate of the same job is serialized by a per-job cluster lock so
  the app-DB row and the Quartz trigger cannot diverge. The lock is held across the trigger
  write."
  [job-id :- ms/PositiveInt]
  (cluster-lock/with-cluster-lock (active-flip-lock-name job-id)
    (flip-active! transforms.db/activate-job! job-id)))

(mu/defn deactivate-job! :- :nil
  "Deactivate a transform job: set `:active` to false, which removes its Quartz trigger so cron
  firings stop. Manual runs via the API still work. Idempotent — calling on an already-inactive
  job is a no-op.

  Concurrent activate/deactivate of the same job is serialized by a per-job cluster lock — see
  [[activate-job!]]."
  [job-id :- ms/PositiveInt]
  (cluster-lock/with-cluster-lock (active-flip-lock-name job-id)
    (flip-active! transforms.db/deactivate-job! job-id)))

(mu/defn update-job-tags! :- :nil
  "Update the tags associated with a job using smart diff logic.
   Only modifies what has changed: deletes removed tags, updates positions for moved tags,
   and inserts new tags. Duplicate tag IDs are automatically deduplicated."
  [job-id  :- [:maybe ms/PositiveInt]
   tag-ids :- [:sequential ms/PositiveInt]]
  (when job-id
    (t2/with-transaction [_conn]
      (let [;; Deduplicate, just in case
            deduped-tag-ids      (vec (distinct tag-ids))
            ;; Get current associations
            current-associations (transforms.db/job-tag-links [job-id])
            current-tag-ids      (mapv :tag_id current-associations)
            ;; Validate that new tag IDs exist
            valid-tag-ids        (when (seq deduped-tag-ids)
                                   (into #{} (transforms.db/existing-tag-ids deduped-tag-ids)))
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
          (transform-job-transform-tag/delete-transform-job-transform-tags! job-id to-delete))
        ;; Update positions for existing tags that moved
        (doseq [tag-id (filter current-set new-tag-ids)]
          (let [new-pos (get new-positions tag-id)]
            (transform-job-transform-tag/update-transform-job-transform-tag! job-id tag-id {:position new-pos})))
        ;; Insert new associations with correct positions
        (when (seq to-insert)
          (transform-job-transform-tag/create-transform-job-transform-tags!
           (for [tag-id to-insert]
             {:job_id   job-id
              :tag_id   tag-id
              :position (get new-positions tag-id)})))))
    nil))

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod app-db-copy/spec :model/TransformJob [_model]
  {:skip? false})

(defmethod serialization/spec :model/TransformJob [_]
  {:schema              ::transforms.schema/external-transform-job
   :copy                [:entity_id :built_in_type :schedule :ui_display_type]
   :skip                [:active]
   :transform           {:name        transforms.serialization/string-transform
                         :description transforms.serialization/string-transform}
   :children            {:job_tags :model/TransformJobTransformTag}
   :insert!             create-transform-jobs!
   :update!             #(update-transform-jobs! % {:writer :import})
   :delete!             delete-transform-jobs!
   :storage-paths       transforms.serialization/transform-job-storage-paths
   :import-dependencies transforms.serialization/transform-job-import-dependencies})
