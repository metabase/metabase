(ns metabase.transforms.models.job-run
  (:require
   [metabase.models.interface :as mi]
   [metabase.transforms.coordinated-run :as coordinated-run]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.util :as transforms.models.u]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformJobRun [_model] :transform_job_run)

(derive :model/TransformJobRun :metabase/model)
(derive :model/TransformJobRun :hook/timestamped?)

(def ^:private terminal-statuses
  #{:succeeded :failed :canceled :timeout})

(t2/define-before-update :model/TransformJobRun
  [run]
  (let [changes (t2/changes run)]
    (cond-> run
      (and (contains? terminal-statuses (keyword (:status changes))) (not (contains? changes :end_time)))
      (assoc :end_time (mi/now)))))

(t2/deftransforms :model/TransformJobRun
  {:status mi/transform-keyword
   :run_method mi/transform-keyword})

(mu/defn latest-runs :- [:maybe [:vector ::transforms.schema/transform-job-run]]
  "Return the latest runs for `job-ids`."
  [job-ids :- [:set ms/PositiveInt]]
  (when (seq job-ids)
    (into [] (map (comp t2.realize/realize #(dissoc % :rn)))
          (transforms.db/latest-job-runs-reducible job-ids))))

(mu/defn start-run! :- ::transforms.schema/transform-job-run
  "Start a run. Snapshots the job's name and entity_id so the run stays displayable after the job
  is deleted (`transform_job_run.job_id` has no FK; job runs outlive their job)."
  ([job-id     :- ms/PositiveInt
    run-method :- [:enum :manual :cron]]
   ;; :built_in_type so the after-select hook localizes built-in job names; str realizes the
   ;; LocalizedString into the snapshot
   (let [job (transforms.db/job-snapshot job-id)]
     (transforms.db/insert-job-run! {:job_id        job-id
                                     :job_name      (some-> (:name job) str)
                                     :job_entity_id (:entity_id job)
                                     :run_method    run-method
                                     :status        :started
                                     :is_active     true}))))

(mu/defn reap-orphaned-runs! :- [:maybe [:sequential ::transforms.schema/transform-job-run]]
  "Time out active job runs whose `last_heartbeat` is older than `stale-minutes` (their coordinator
  process is presumed dead). Returns the rows that were timed out so callers can notify."
  [stale-minutes :- ms/PositiveInt]
  (coordinated-run/reap-orphaned-runs! :model/TransformJobRun "job" stale-minutes))

(mu/defn running-run-for-job-id :- [:maybe ::transforms.schema/transform-job-run]
  "Return a single active job run or nil."
  [id :- ms/PositiveInt]
  (transforms.db/active-job-run-for-job id))

(mu/defn paged-job-runs :- [:map {:closed true}
                            [:data   [:sequential ::transforms.schema/transform-job-run]]
                            [:limit  ms/PositiveInt]
                            [:offset ms/IntGreaterThanOrEqualToZero]
                            [:total  ms/IntGreaterThanOrEqualToZero]]
  "Return a page of the list of job runs.

  Follows the conventions used by the FE."
  [{:keys [sort-column sort-direction job-id status run-method start-time offset limit]}
   :- [:map {:closed true}
       [:sort-column    {:optional true} [:maybe [:or :keyword :string]]]
       [:sort-direction {:optional true} [:maybe [:or :keyword :string]]]
       [:job-id         {:optional true} [:maybe ms/PositiveInt]]
       [:status         {:optional true} [:maybe :string]]
       [:run-method     {:optional true} [:maybe :string]]
       [:start-time     {:optional true} [:maybe :string]]
       [:offset         {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
       [:limit          {:optional true} [:maybe ms/PositiveInt]]]]
  (let [offset          (or offset 0)
        limit           (or limit 20)
        [start-at end-at] (when start-time (transforms.models.u/timestamp-range start-time))]
    {:data   (transforms.db/job-runs job-id status run-method start-at end-at sort-column sort-direction limit offset)
     :limit  limit
     :offset offset
     :total  (transforms.db/job-run-count job-id status run-method start-at end-at)}))

(mu/defn transform-runs-for-job-run :- [:sequential ::transforms.schema/transform-run]
  "Return transform runs that were part of the given job run, ordered by start time."
  [job-run-id :- ms/PositiveInt]
  (transforms.db/runs-for-job-run job-run-id))
