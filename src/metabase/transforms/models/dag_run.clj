(ns metabase.transforms.models.dag-run
  "A `transform_dag_run` tracks a manual DAG-reprocess run: reprocessing the transitive dependency DAG
  rooted at a single seed transform (upstream or downstream). Like a scheduled job run it coordinates
  many member transform runs, but it is always triggered manually from one transform rather than by a
  job — so it has its own table rather than overloading `transform_job_run`. Member runs link back
  via `transform_run.dag_run_id`."
  (:require
   [metabase.models.interface :as mi]
   [metabase.run-tracking.core :as rt]
   [metabase.transforms.models.util :as transforms.models.u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformDagRun [_model] :transform_dag_run)

(derive :model/TransformDagRun :metabase/model)
(derive :model/TransformDagRun :hook/timestamped?)

(t2/deftransforms :model/TransformDagRun
  {:status    mi/transform-keyword
   :direction mi/transform-keyword})

(defn start-dag-run!
  "Start a DAG-reprocess run seeded from `source-transform-id`, traversing `direction`
  (`:upstream`/`:downstream`). `user-id` is the user who triggered it."
  [source-transform-id direction user-id]
  (t2/insert-returning-instance! :model/TransformDagRun
                                 {:source_transform_id source-transform-id
                                  :direction           direction
                                  :user_id             user-id
                                  :status              :started
                                  :is_active           true}))

(defn add-run-activity!
  "Note that a run has had activity (touches `updated_at`)."
  [run-id]
  (t2/update! :model/TransformDagRun
              :id        run-id
              :is_active true
              {:updated_at :%now}))

(defn succeed-started-run!
  "Mark a started run as successfully completed."
  ([run-id]
   (succeed-started-run! run-id {}))
  ([run-id properties]
   (t2/update! :model/TransformDagRun
               :id        run-id
               :is_active true
               (merge {:end_time :%now}
                      properties
                      {:status    :succeeded
                       :is_active nil}))))

(defn fail-started-run!
  "Mark the started active run as failed and inactive."
  [run-id properties]
  (t2/update! :model/TransformDagRun
              :id        run-id
              :is_active true
              (merge {:end_time :%now}
                     properties
                     {:status    :failed
                      :is_active nil})))

(defn cancel-started-run!
  "Mark an active run as canceled. Returns the number of rows updated — 0 if the run had already
  finished (the `is_active` guard means a completed run is never resurrected into a canceled state)."
  [run-id]
  (t2/update! :model/TransformDagRun
              :id        run-id
              :is_active true
              {:status    :canceled
               :is_active nil
               :end_time  :%now
               :message   "Canceled"}))

(defn heartbeat-runs!
  "Stamp `last_heartbeat = now` on the given still-active DAG-run-ids."
  [run-ids]
  (rt/heartbeat-ids! :model/TransformDagRun [:= :is_active true] :last_heartbeat run-ids))

(defn reap-orphaned-runs!
  "Time out active DAG runs whose `last_heartbeat` is older than `stale-minutes` (their coordinator
  process is presumed dead). Returns the rows that were timed out so callers can notify."
  [stale-minutes]
  (rt/reap-orphaned!
   {:model    :model/TransformDagRun
    :active   [:= :is_active true]
    :stale    [:< :last_heartbeat (rt/cutoff stale-minutes :minute)]
    :terminal {:status "timeout" :end_time :%now :is_active nil :message "Timed out: crashed"}
    :metrics  {:total-metric   :metabase-transforms/timeouts-total
               :latency-metric :metabase-transforms/timeout-detection-latency-ms
               :tags           {:type "dag"}
               :latency-column :last_heartbeat
               :timeout-ms     (rt/unit->ms stale-minutes :minute)}}))

(defn running-run-for-source-transform-id
  "Return the single active DAG run seeded from `source-transform-id`, or nil."
  [source-transform-id]
  (t2/select-one :model/TransformDagRun
                 :source_transform_id source-transform-id
                 :is_active           true))

(defn paged-dag-runs
  "Return a page of DAG run history for a single seed transform.

  Follows the conventions used by the FE."
  [{:keys [source-transform-id sort-column sort-direction status] :as params}]
  (let [where-cond (cond-> [[:= :source_transform_id source-transform-id]]
                     status               (conj [:= :status status])
                     (= status "started") (conj [:= :is_active true]))
        where      (into [:and] where-cond)]
    (transforms.models.u/paged-run-listing :model/TransformDagRun
                                           params
                                           (transforms.models.u/run-order-by sort-column sort-direction)
                                           where)))

(defn paged-all-dag-runs
  "Return a page of DAG run history across every transform (the cross-transform \"DAG runs\" view).

  Follows the conventions used by the FE."
  [{:keys [sort-column sort-direction status start-time] :as params}]
  (let [where-cond (cond-> []
                     status               (conj [:= :status status])
                     (= status "started") (conj [:= :is_active true])
                     start-time           (conj (transforms.models.u/timestamp-constraint :start_time start-time)))
        where      (when (seq where-cond) (into [:and] where-cond))]
    (transforms.models.u/paged-run-listing :model/TransformDagRun
                                           params
                                           (transforms.models.u/run-order-by sort-column sort-direction)
                                           where)))

(defn active-transform-run-ids-for-dag-run
  "Ids of the member transform runs of `dag-run-id` that are still active."
  [dag-run-id]
  (t2/select-pks-vec :model/TransformRun :dag_run_id dag-run-id :is_active true))

(defn transform-runs-for-dag-run
  "Return the transform runs that were part of the given DAG run, ordered by start time."
  [dag-run-id]
  (t2/select :model/TransformRun
             {:where    [:= :dag_run_id dag-run-id]
              :order-by [[:start_time :asc]]}))
