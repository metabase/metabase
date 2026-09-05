(ns metabase.transforms.models.job-run
  (:require
   [metabase.models.interface :as mi]
   [metabase.transforms.coordinated-run :as coordinated-run]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.util :as transforms.models.u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformJobRun [_model] :transform_job_run)

(derive :model/TransformJobRun :metabase/model)
(derive :model/TransformJobRun :hook/timestamped?)

(t2/deftransforms :model/TransformJobRun
  {:status mi/transform-keyword
   :run_method mi/transform-keyword})

(defn latest-runs
  "Return the latest runs for `job-ids`."
  [job-ids]
  (when (seq job-ids)
    (into [] (map (comp t2.realize/realize #(dissoc % :rn)))
          (transforms.db/latest-job-runs-reducible job-ids))))

(defn start-run!
  "Start a run. Snapshots the job's name and entity_id so the run stays displayable after the job
  is deleted (`transform_job_run.job_id` has no FK; job runs outlive their job)."
  ([job-id run-method]
   ;; :built_in_type so the after-select hook localizes built-in job names; str realizes the
   ;; LocalizedString into the snapshot
   (let [job (transforms.db/job-snapshot job-id)]
     (transforms.db/insert-job-run! {:job_id        job-id
                                     :job_name      (some-> (:name job) str)
                                     :job_entity_id (:entity_id job)
                                     :run_method    run-method
                                     :status        :started
                                     :is_active     true}))))

(defn reap-orphaned-runs!
  "Time out active job runs whose `last_heartbeat` is older than `stale-minutes` (their coordinator
  process is presumed dead). Returns the rows that were timed out so callers can notify."
  [stale-minutes]
  (coordinated-run/reap-orphaned-runs! :model/TransformJobRun "job" stale-minutes))

(defn running-run-for-job-id
  "Return a single active job run or nil."
  [id]
  (transforms.db/active-job-run-for-job id))

(defn paged-job-runs
  "Return a page of the list of job runs.

  Follows the conventions used by the FE."
  [{:keys [sort-column sort-direction job-id status run-method start-time offset limit]}]
  (let [offset          (or offset 0)
        limit           (or limit 20)
        [start-at end-at] (when start-time (transforms.models.u/timestamp-range start-time))]
    {:data   (transforms.db/job-runs job-id status run-method start-at end-at sort-column sort-direction limit offset)
     :limit  limit
     :offset offset
     :total  (transforms.db/job-run-count job-id status run-method start-at end-at)}))

(defn transform-runs-for-job-run
  "Return transform runs that were part of the given job run, ordered by start time."
  [job-run-id]
  (transforms.db/runs-for-job-run job-run-id))
