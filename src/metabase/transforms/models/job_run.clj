(ns metabase.transforms.models.job-run
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.transforms.models.timeout-util :as timeout-util]
   [metabase.util.honey-sql-2 :as h2x]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize])
  (:import
   (java.time Instant)))

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

(defn timeout-old-runs!
  "Time out all active job runs older than the specified age. Returns the rows that
  were timed out so callers can take follow-up action (e.g. sending notifications).
  See [[metabase.transforms.models.timeout-util/timeout-rows!]] for atomicity rationale."
  [age unit]
  (let [cutoff      (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)
        timeout-dur (timeout-util/unit->duration age unit)
        detected-at (Instant/now)
        timed-out   (timeout-util/timeout-rows! :model/TransformJobRun :updated_at cutoff)]
    (when (seq timed-out)
      (analytics/inc! :metabase-transforms/timeouts-total
                      {:type "job"}
                      (count timed-out))
      (doseq [run timed-out]
        (when-let [updated-at (:updated_at run)]
          (analytics/observe! :metabase-transforms/timeout-detection-latency-ms
                              {:type "job"}
                              (timeout-util/detection-latency-ms updated-at timeout-dur detected-at)))))
    timed-out))

(defn running-run-for-job-id
  "Return a single active job run or nil."
  [id]
  (t2/select-one :model/TransformJobRun
                 :job_id id
                 :is_active true))

(defn paged-runs
  "Return a page of the list of the runs.

  Follows the conventions used by the FE."
  [{:keys [offset
           limit
           sort_column
           sort_direction
           job_id
           status]}]
  (let [offset (or offset 0)
        limit  (or limit 20)
        sort-direction (or (keyword sort_direction) :desc)
        nulls-sort (if (= sort-direction :asc)
                     :nulls-last
                     :nulls-first)
        sort-column (keyword sort_column)
        order-by (case sort_column
                   :started_at [[sort-column sort-direction]]
                   :ended_at   [[sort-column sort-direction nulls-sort]]
                   [[:start_time sort-direction]
                    [:end_time   sort-direction nulls-sort]])
        conditions (concat (when job_id
                             [:job_id job_id])
                           (when status
                             [:= :status status])
                           (when (= status "started")
                             [:is_active true]))
        conditions-with-sort-and-pagination (concat conditions [{:order-by order-by
                                                                 :offset offset
                                                                 :limit limit}])
        runs (apply t2/select :model/TransformJobRun conditions-with-sort-and-pagination)]
    {:data (t2/hydrate runs :transform)
     :limit limit
     :offset offset
     :total (apply t2/count :model/TransformJobRun conditions)}))
