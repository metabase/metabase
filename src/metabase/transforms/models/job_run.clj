(ns metabase.transforms.models.job-run
  (:require
   [metabase.models.interface :as mi]
   [metabase.run-tracking.core :as rt]
   [metabase.transforms.models.util :as transforms.models.u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformJobRun [_model] :transform_job_run)

(derive :model/TransformJobRun :metabase/model)
(derive :model/TransformJobRun :hook/timestamped?)

(t2/deftransforms :model/TransformJobRun
  {:status     mi/transform-keyword
   :run_method mi/transform-keyword
   :direction  mi/transform-keyword})

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
  "Start a job run (triggered by a scheduled job)."
  [job-id run-method]
  (t2/insert-returning-instance! :model/TransformJobRun
                                 {:job_id     job-id
                                  :run_method run-method
                                  :status     :started
                                  :is_active  true}))

(defn start-dag-run!
  "Start a DAG-reprocess run (triggered manually from a single seed transform)."
  [source-transform-id direction run-method user-id]
  (t2/insert-returning-instance! :model/TransformJobRun
                                 {:source_transform_id source-transform-id
                                  :direction           (name direction)
                                  :run_method          run-method
                                  :status              :started
                                  :is_active           true
                                  :user_id             user-id}))

(defn add-run-activity!
  "Notes that a run has had activity"
  [run-id]
  (t2/update! :model/TransformJobRun
              :id        run-id
              :is_active true
              {:updated_at :%now}))

(defn succeed-started-run!
  "Mark a started run as successfully completed."
  ([run-id]
   (succeed-started-run! run-id {}))
  ([run-id properties]
   (t2/update! :model/TransformJobRun
               :id        run-id
               :is_active true
               (merge {:end_time :%now}
                      properties
                      {:status    :succeeded
                       :is_active nil}))))

(defn fail-started-run!
  "Mark the started active run as failed and inactive."
  [run-id properties]
  (t2/update! :model/TransformJobRun
              :id        run-id
              :is_active true
              (merge {:end_time :%now}
                     properties
                     {:status :failed
                      :is_active nil})))

(defn cancel-started-run!
  "Mark an active run as canceled. Returns the number of rows updated — 0 if the run had already
  finished (the `is_active` guard means a completed run is never resurrected into a canceled state)."
  [run-id]
  (t2/update! :model/TransformJobRun
              :id        run-id
              :is_active true
              {:status    :canceled
               :is_active nil
               :end_time  :%now
               :message   "Canceled"}))

(defn active-transform-run-ids-for-job-run
  "Ids of the member transform runs of `job-run-id` that are still active."
  [job-run-id]
  (t2/select-pks-vec :model/TransformRun :job_run_id job-run-id :is_active true))

(defn heartbeat-runs!
  "Stamp `last_heartbeat = now` on the given still-active job-run-ids."
  [run-ids]
  (rt/heartbeat-ids! :model/TransformJobRun [:= :is_active true] :last_heartbeat run-ids))

(defn reap-orphaned-runs!
  "Time out active job runs whose `last_heartbeat` is older than `stale-minutes` (their coordinator
  process is presumed dead). Returns the rows that were timed out so callers can notify."
  [stale-minutes]
  (rt/reap-orphaned!
   {:model    :model/TransformJobRun
    :active   [:= :is_active true]
    :stale    [:< :last_heartbeat (rt/cutoff stale-minutes :minute)]
    :terminal {:status "timeout" :end_time :%now :is_active nil :message "Timed out: crashed"}
    :metrics  {:total-metric   :metabase-transforms/timeouts-total
               :latency-metric :metabase-transforms/timeout-detection-latency-ms
               :tags           {:type "job"}
               :latency-column :last_heartbeat
               :timeout-ms     (rt/unit->ms stale-minutes :minute)}}))

(defn running-run-for-job-id
  "Return a single active job run or nil."
  [id]
  (t2/select-one :model/TransformJobRun
                 :job_id    id
                 :is_active true))

(defn running-run-for-source-transform-id
  "Return the single active DAG run for `source-transform-id`, or nil."
  [source-transform-id]
  (t2/select-one :model/TransformJobRun
                 :source_transform_id source-transform-id
                 :is_active           true))

(defn paged-job-runs
  "Return a page of the list of job runs.

  Follows the conventions used by the FE."
  [{:keys [offset limit sort-column sort-direction job-id status run-method start-time]}]
  (let [offset         (or offset 0)
        limit          (or limit 20)
        sort-direction (or (keyword sort-direction) :desc)
        nulls-sort     (if (= sort-direction :asc) :nulls-last :nulls-first)
        sort-column    (keyword sort-column)
        order-by       (case sort-column
                         :start_time [[sort-column sort-direction]]
                         :end_time   [[sort-column sort-direction nulls-sort]]
                         [[:start_time sort-direction]
                          [:end_time   sort-direction nulls-sort]])
        where-cond     (cond-> []
                         job-id               (conj [:= :job_id job-id])
                         status               (conj [:= :status status])
                         (= status "started") (conj [:= :is_active true])
                         run-method           (conj [:= :run_method run-method])
                         start-time           (conj (transforms.models.u/timestamp-constraint :start_time start-time)))
        where          (when (seq where-cond) (into [:and] where-cond))
        query-opts     (cond-> {:order-by order-by :offset offset :limit limit}
                         where (assoc :where where))
        count-opts     (if where {:where where} {})
        runs           (t2/select :model/TransformJobRun query-opts)]
    {:data   runs
     :limit  limit
     :offset offset
     :total  (t2/count :model/TransformJobRun count-opts)}))

(defn paged-dag-runs
  "Return a page of DAG run history for `source-transform-id`."
  [{:keys [source-transform-id offset limit sort-column sort-direction status]}]
  (let [offset         (or offset 0)
        limit          (or limit 20)
        sort-direction (or (keyword sort-direction) :desc)
        nulls-sort     (if (= sort-direction :asc) :nulls-last :nulls-first)
        sort-column    (keyword (or sort-column :start_time))
        order-by       (case sort-column
                         :start_time [[sort-column sort-direction]]
                         :end_time   [[sort-column sort-direction nulls-sort]]
                         [[:start_time sort-direction]
                          [:end_time   sort-direction nulls-sort]])
        where-cond     (cond-> [[:= :source_transform_id source-transform-id]]
                         status               (conj [:= :status status])
                         (= status "started") (conj [:= :is_active true]))
        where          (into [:and] where-cond)
        query-opts     {:order-by order-by :offset offset :limit limit :where where}
        runs           (t2/select :model/TransformJobRun query-opts)]
    {:data   runs
     :limit  limit
     :offset offset
     :total  (t2/count :model/TransformJobRun {:where where})}))

(defn paged-all-dag-runs
  "Return a page of all manual DAG-reprocess runs across every transform — the rows where
  `source_transform_id` is set (as opposed to scheduled job runs, which set `job_id`).
  Mirrors [[paged-job-runs]] but scoped to DAG runs and not filtered to a single job/transform."
  [{:keys [offset limit sort-column sort-direction status run-method start-time]}]
  (let [offset         (or offset 0)
        limit          (or limit 20)
        sort-direction (or (keyword sort-direction) :desc)
        nulls-sort     (if (= sort-direction :asc) :nulls-last :nulls-first)
        sort-column    (keyword (or sort-column :start_time))
        order-by       (case sort-column
                         :start_time [[sort-column sort-direction]]
                         :end_time   [[sort-column sort-direction nulls-sort]]
                         [[:start_time sort-direction]
                          [:end_time   sort-direction nulls-sort]])
        where-cond     (cond-> [[:not= :source_transform_id nil]]
                         status               (conj [:= :status status])
                         (= status "started") (conj [:= :is_active true])
                         run-method           (conj [:= :run_method run-method])
                         start-time           (conj (transforms.models.u/timestamp-constraint :start_time start-time)))
        where          (into [:and] where-cond)
        query-opts     {:order-by order-by :offset offset :limit limit :where where}
        runs           (t2/select :model/TransformJobRun query-opts)]
    {:data   runs
     :limit  limit
     :offset offset
     :total  (t2/count :model/TransformJobRun {:where where})}))

(defn transform-runs-for-job-run
  "Return transform runs that were part of the given job run, ordered by start time."
  [job-run-id]
  (t2/select :model/TransformRun
             {:where    [:= :job_run_id job-run-id]
              :order-by [[:start_time :asc]]}))
