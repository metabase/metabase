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

(def ^:private built-in-types
  "The `built_in_type` of the built-in TransformJobs."
  ["hourly" "daily" "weekly" "monthly"])

(defn- built-in-values
  "A map from each `built_in_type` to its translated `column`, `:name` or `:description`, as a string."
  [column]
  (into {} (map (fn [built-in-type]
                  [built-in-type (str (get (translated-name-and-description {:built_in_type built-in-type}) column))]))
        built-in-types))

(t2/define-before-update :model/TransformJob [job]
  (let [changes (t2/changes job)]
    (if (or (empty? (dissoc changes :updated_at))
            (contains? changes :built_in_type))
      job
      ;; An array map keeps the name and description first, so that a statement that evaluates its assignments in order
      ;; still reads the built-in type of the stored row.
      (merge (array-map :name          (transforms.db/built-in-value-clause :name (built-in-values :name))
                        :description   (transforms.db/built-in-value-clause :description (built-in-values :description))
                        :built_in_type nil)
             changes))))

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
  "Insert the TransformJob `rows`, link the `:tag_ids` of each, schedule the Quartz trigger of each active one, and
  return the inserted jobs, publishing their create event."
  [rows :- [:sequential ::transforms.schema/transform-job.create]]
  (if (seq rows)
    (t2/with-transaction [_conn]
      (let [jobs (transforms.db/insert-jobs! (mapv #(dissoc % :tag_ids) rows))]
        (when-let [links (not-empty (into []
                                          (mapcat (fn [[job {:keys [tag_ids]}]]
                                                    (map-indexed (fn [position tag-id]
                                                                   {:job_id (:id job) :tag_id tag-id :position position})
                                                                 tag_ids)))
                                          (map vector jobs rows)))]
          (transform-job-transform-tag/create-transform-job-transform-tags! links))
        (sync-triggers! jobs)
        (events/publish-event! :event/transform-job-create (events/create-event jobs))
        jobs))
    []))

(defn- updated-job
  "The TransformJob `stored` as the update `changes` leaves it: a built-in job becomes a custom one that keeps its
  name and description, as the update makes it."
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

(defn- write-columns!
  "Apply the `columns` to the jobs of `stored`, a map from id to the TransformJob as read, then make the Quartz trigger
  of each job match its row."
  [stored columns]
  (when (seq columns)
    (transforms.db/update-jobs! stored columns))
  (sync-triggers! (transforms.db/jobs-by-ids (vec (keys stored)))))

(defn- column-update-event
  "The update event of the jobs of `stored` that the `columns` change."
  [stored ids columns opts]
  (events/update-event stored
                       (mapv #(assoc columns :id %) ids)
                       (assoc opts :objects (update-vals stored #(updated-job % columns)))))

(mu/defn update-transform-jobs! :- :nil
  "Apply the `changes`, columns of a TransformJob, to each of the jobs with `ids` in one transaction, then make the
  Quartz trigger of each job match its row, publishing their update event."
  ([ids     :- [:sequential ms/PositiveInt]
    changes :- ::transforms.schema/transform-job.update]
   (update-transform-jobs! ids changes nil))
  ([ids     :- [:sequential ms/PositiveInt]
    changes :- ::transforms.schema/transform-job.update
    opts    :- ::transforms.schema/write-opts]
   (when (seq ids)
     (t2/with-transaction [_conn]
       (let [stored (u/index-by :id (transforms.db/jobs-by-ids (vec ids)))]
         (when (seq stored)
           (write-columns! stored changes)
           (events/publish-event! :event/transform-job-update
                                  (column-update-event stored (filter stored ids) changes opts))))))
   nil))

(mu/defn update-transform-jobs-for-import! :- :nil
  "Apply each of `rows`, the id of a TransformJob and the columns to change, as an import writes it, one row at a time:
  a built-in job keeps its name and description. An import runs rows with different values, which one change for all
  cannot express."
  [rows :- [:sequential ::transforms.schema/transform-job.import-row]]
  (doseq [{:keys [id] :as row} rows
          :let [stored (transforms.db/job id)
                changes (cond-> (dissoc row :id)
                          (and (some? (:built_in_type stored)) (not (contains? row :built_in_type)))
                          (dissoc :name :description))]]
    (update-transform-jobs! [id] changes {:writer :import}))
  nil)

(mu/defn- replace-tags! :- :boolean
  "Make the TransformTags linked to the TransformJob with `job-id` those of `tag-ids`, in that order, with smart diff
  logic: deletes removed tags, updates positions for moved tags, and inserts new tags. Duplicate and unknown tag ids are
  left out. Returns whether the tags changed."
  [job-id  :- ms/PositiveInt
   tag-ids :- [:sequential ms/PositiveInt]]
  (let [deduped-tag-ids      (vec (distinct tag-ids))
        current-associations (transforms.db/job-tag-links [job-id])
        current-tag-ids      (mapv :tag_id current-associations)
        valid-tag-ids        (when (seq deduped-tag-ids)
                               (into #{} (transforms.db/existing-tag-ids deduped-tag-ids)))
        new-tag-ids          (if valid-tag-ids
                               (filterv valid-tag-ids deduped-tag-ids)
                               [])
        current-set          (set current-tag-ids)
        new-set              (set new-tag-ids)
        to-delete            (set/difference current-set new-set)
        to-insert            (set/difference new-set current-set)
        new-positions        (zipmap new-tag-ids (range))]
    (when (seq to-delete)
      (transform-job-transform-tag/delete-transform-job-transform-tags-for-job! job-id to-delete))
    (transform-job-transform-tag/update-transform-job-transform-tags-for-job! job-id (select-keys new-positions current-set))
    (when (seq to-insert)
      (transform-job-transform-tag/create-transform-job-transform-tags!
       (for [tag-id to-insert]
         {:job_id   job-id
          :tag_id   tag-id
          :position (get new-positions tag-id)})))
    (not= current-tag-ids new-tag-ids)))

(mu/defn update-transform-job! :- :nil
  "Apply the `changes`, columns of the TransformJob with `id` and the `:tag_ids` it has afterwards, in one transaction,
  then make its Quartz trigger match its row, publishing one update event: of its columns, or a touch when only its
  tags changed."
  ([id      :- ms/PositiveInt
    changes :- ::transforms.schema/transform-job.update-with-tags]
   (update-transform-job! id changes nil))
  ([id      :- ms/PositiveInt
    changes :- ::transforms.schema/transform-job.update-with-tags
    opts    :- ::transforms.schema/write-opts]
   (t2/with-transaction [_conn]
     (when-let [stored (transforms.db/job id)]
       (let [columns       (dissoc changes :tag_ids)
             tags-changed? (and (contains? changes :tag_ids) (replace-tags! id (:tag_ids changes)))]
         (when (or (seq columns) tags-changed?)
           (write-columns! {id stored} columns)
           (events/publish-event! :event/transform-job-update
                                  (if (seq columns)
                                    (column-update-event {id stored} [id] columns opts)
                                    (events/touch-event [stored] opts)))))))
   nil))

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
  "Mark the TransformJob with `job-id` active or inactive, as `active?` says, and make its Quartz trigger match when it
  changed the row, publishing its update event."
  [job-id  :- ms/PositiveInt
   active? :- :boolean]
  (t2/with-transaction [_conn]
    (when-let [previous (transforms.db/job job-id)]
      (when (pos? (transforms.db/flip-job-active! job-id active?))
        (sync-triggers! [(assoc previous :active active?)])
        (events/publish-event! :event/transform-job-update
                               (events/update-event {job-id previous}
                                                    [{:id job-id :active active?}]
                                                    {:objects {job-id (updated-job previous {:active active?})}})))))
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
    (flip-active! job-id true)))

(mu/defn deactivate-job! :- :nil
  "Deactivate a transform job: set `:active` to false, which removes its Quartz trigger so cron
  firings stop. Manual runs via the API still work. Idempotent — calling on an already-inactive
  job is a no-op.

  Concurrent activate/deactivate of the same job is serialized by a per-job cluster lock — see
  [[activate-job!]]."
  [job-id :- ms/PositiveInt]
  (cluster-lock/with-cluster-lock (active-flip-lock-name job-id)
    (flip-active! job-id false)))

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
   :update!             update-transform-jobs-for-import!
   :delete!             delete-transform-jobs!
   :storage-paths       transforms.serialization/transform-job-storage-paths
   :import-dependencies transforms.serialization/transform-job-import-dependencies})
