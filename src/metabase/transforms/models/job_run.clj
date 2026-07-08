(ns metabase.transforms.models.job-run
  (:require
   [metabase.models.interface :as mi]
   [metabase.transforms.coordinated-run :as coordinated-run]
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

(defn- latest-runs-query [job-ids]
  {:with [[:ranked_runs
           {:select [:*
                     [[:over [[:row_number] {:partition-by :job_id, :order-by [[:start_time :desc]]}]] :rn]]
            :from [:transform_job_run]
            :where [:in :job_id job-ids]}]]
   :select [:*]
   :from [:ranked_runs]
   :where [:= :rn [:inline 1]]})

(defn latest-runs
  "Return the latest runs for `job-ids`."
  [job-ids]
  (when (seq job-ids)
    (into [] (map (comp t2.realize/realize #(dissoc % :rn)))
          (t2/reducible-select :model/TransformJobRun (latest-runs-query job-ids)))))

(defn start-run!
  "Start a run"
  ([job-id run-method]
   (t2/insert-returning-instance! :model/TransformJobRun
                                  {:job_id job-id
                                   :run_method run-method
                                   :status :started
                                   :is_active true})))

(defn reap-orphaned-runs!
  "Time out active job runs whose `last_heartbeat` is older than `stale-minutes` (their coordinator
  process is presumed dead). Returns the rows that were timed out so callers can notify."
  [stale-minutes]
  (coordinated-run/reap-orphaned-runs! :model/TransformJobRun "job" stale-minutes))

(defn running-run-for-job-id
  "Return a single active job run or nil."
  [id]
  (t2/select-one :model/TransformJobRun
                 :job_id id
                 :is_active true))

(defn paged-job-runs
  "Return a page of the list of job runs.

  Follows the conventions used by the FE."
  [{:keys [sort-column sort-direction job-id status run-method start-time offset limit]}]
  (let [offset     (or offset 0)
        limit      (or limit 20)
        where-cond (cond-> []
                     job-id               (conj [:= :job_id job-id])
                     status               (conj [:= :status status])
                     (= status "started") (conj [:= :is_active true])
                     run-method           (conj [:= :run_method run-method])
                     start-time           (conj (transforms.models.u/timestamp-constraint :start_time start-time)))
        where      (when (seq where-cond) (into [:and] where-cond))]
    {:data   (t2/select :model/TransformJobRun
                        (cond-> {:order-by (transforms.models.u/run-order-by sort-column sort-direction)
                                 :offset   offset
                                 :limit    limit}
                          where (assoc :where where)))
     :limit  limit
     :offset offset
     :total  (t2/count :model/TransformJobRun (if where {:where where} {}))}))

(defn transform-runs-for-job-run
  "Return transform runs that were part of the given job run, ordered by start time."
  [job-run-id]
  (t2/select :model/TransformRun
             {:where    [:= :job_run_id job-run-id]
              :order-by [[:start_time :asc]]}))
