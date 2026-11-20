(ns metabase.transforms.run-write
  "The write functions of the run models, `:model/TransformRun`, `:model/TransformJobRun` and `:model/TransformDagRun`,
  which the scheduler writes at high frequency: each is one statement, with the `end_time` of a run that ends and the
  `updated_at` of a coordinated run set here, and no read of the row first."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.run-tracking.core :as rt]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.transform-run-cancelation :as cancel]
   [metabase.transforms.models.util :as transforms.models.u]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(mr/def ::canceled-run
  "A TransformRun force-canceled by [[cancel-old-canceling-runs!]], with the time its cancelation was requested."
  [:merge
   ::transforms.schema/transform-run
   [:map {:closed true}
    [:request_time ms/TemporalInstant]]])

(defn- with-end-time
  "`changes` of a run, with the `end_time` of a run that `changes` ends and gives none."
  [changes]
  (cond-> changes
    (transforms.models.u/ended-without-end-time? changes) (assoc :end_time (mi/now))))

(defn- with-times
  "`changes` of a coordinated run, with its `end_time` when it ends and the `updated_at` of the update."
  [changes]
  (cond-> (with-end-time changes)
    (not (contains? changes :updated_at)) (assoc :updated_at (mi/now))))

;;; ------------------------------------------------ Transform runs ------------------------------------------------

(mu/defn start-run! :- ::transforms.schema/transform-run
  "Start a run of the Transform `transform-id`, whose `:user_id` in `properties` attributes the run in the audit log
  and whose insert hook captures `transform_name`, `transform_entity_id` and `metered_as`."
  ([transform-id :- ::lib.schema.id/transform]
   (start-run! transform-id {}))
  ([transform-id :- ::lib.schema.id/transform
    properties   :- ::transforms.schema/transform-run.update]
   (let [run (transforms.db/insert-run! (assoc properties
                                               :transform_id transform-id
                                               :status :started
                                               :is_active true))]
     (events/publish-event! :event/transform-run-start
                            (cond-> {:object run}
                              (:user_id run) (assoc :user-id (:user_id run))))
     run)))

(mu/defn update-run! :- :int
  "Apply `changes` to the run `run-id`, for the checkpoint and message of a run that is running, returning the number
  of runs updated."
  [run-id  :- ms/PositiveInt
   changes :- ::transforms.schema/transform-run.changes
   _opts   :- ::transforms.schema/write-opts]
  (transforms.db/update-run! run-id (with-end-time changes)))

(mu/defn- finish-active-run! :- :int
  "Apply `changes` to the run `run-id` if it is still active, then delete its cancelation."
  [run-id  :- ms/PositiveInt
   changes :- ::transforms.schema/transform-run.changes]
  (u/prog1 (transforms.db/finish-active-run! run-id (with-end-time changes))
    (cancel/delete-cancelation! run-id)))

(mu/defn succeed-started-run! :- :int
  "Mark a started run as successfully completed."
  ([run-id :- ms/PositiveInt]
   (succeed-started-run! run-id {}))
  ([run-id     :- ms/PositiveInt
    properties :- ::transforms.schema/transform-run.update]
   (finish-active-run! run-id (merge properties {:status :succeeded :is_active nil}))))

(mu/defn fail-started-run! :- :int
  "Mark the started active run as failed and inactive."
  [run-id     :- ms/PositiveInt
   properties :- ::transforms.schema/transform-run.update]
  (finish-active-run! run-id (merge properties {:status :failed :is_active nil})))

(mu/defn cancel-run! :- :int
  "Cancel a started run."
  ([run-id :- ms/PositiveInt]
   (cancel-run! run-id {:message "Canceled by user"}))
  ([run-id     :- ms/PositiveInt
    properties :- ::transforms.schema/transform-run.update]
   (finish-active-run! run-id (merge properties {:status :canceled :is_active nil}))))

(mu/defn- publish-timeout-event! :- :nil
  "Publish `:event/transform-run-timeout` for `run`, so that a failure of its handlers does not reach the caller's
  timeout flow."
  [run :- ::transforms.schema/transform-run]
  (try
    (events/publish-event! :event/transform-run-timeout
                           (cond-> {:object run}
                             (:user_id run) (assoc :user-id (:user_id run))))
    (catch Throwable t
      (log/warnf "Failed to publish transform-run-timeout event for run %s: %s" (pr-str (:id run)) (ex-message t))))
  nil)

(mu/defn timeout-run! :- :int
  "Mark a started run as timed out."
  ([run-id :- ms/PositiveInt]
   (timeout-run! run-id {}))
  ([run-id     :- ms/PositiveInt
    properties :- ::transforms.schema/transform-run.update]
   (u/prog1 (finish-active-run! run-id (merge properties {:message "Timed out" :status :timeout :is_active nil}))
     (when (pos? <>)
       (analytics/inc! :metabase-transforms/timeouts-total {:type "transform"})
       (when-let [run (transforms.db/run run-id)]
         (publish-timeout-event! run))))))

(mu/defn- reap-transform-runs! :- [:maybe [:sequential ::transforms.schema/transform-run]]
  "Reap the active transform runs by `stale-column` into a timeout carrying `message`, publishing a timeout event per
  run."
  [stale-column :- [:enum :start_time :last_heartbeat]
   age          :- ms/PositiveInt
   unit         :- :keyword
   message      :- :string]
  (let [end-time (OffsetDateTime/now ZoneOffset/UTC)
        reaped   (rt/reap-orphaned!
                  {:model    :model/TransformRun
                   :active   [:is_active true]
                   :stale    [{:column stale-column :age age :unit unit}]
                   :terminal {:status "timeout" :end_time :%now :is_active nil :message message}
                   :metrics  {:total-metric   :metabase-transforms/timeouts-total
                              :latency-metric :metabase-transforms/timeout-detection-latency-ms
                              :tags           {:type "transform"}
                              :latency-column stale-column
                              :timeout-ms     (rt/unit->ms age unit)}})]
    (doseq [run reaped]
      (publish-timeout-event! (assoc run
                                     :status    :timeout
                                     :is_active nil
                                     :end_time  end-time
                                     :message   message)))
    (cancel/delete-old-canceling-runs!)
    reaped))

(mu/defn timeout-old-runs! :- [:maybe [:sequential ::transforms.schema/transform-run]]
  "Time out all active runs whose `start_time` is older than `age` `unit`s, returning the rows that were timed out."
  [age  :- ms/PositiveInt
   unit :- :keyword]
  (reap-transform-runs! :start_time age unit "Timed out by metabase"))

(mu/defn heartbeat-runs! :- :nil
  "Stamp `last_heartbeat = now` on the given still-active `run-ids`."
  [run-ids :- [:sequential ms/PositiveInt]]
  (rt/heartbeat-ids! :model/TransformRun [:is_active true] :last_heartbeat run-ids)
  nil)

(mu/defn reap-orphaned-runs! :- [:maybe [:sequential ::transforms.schema/transform-run]]
  "Time out the active runs whose `last_heartbeat` is older than `stale-minutes`, their owning process being presumed
  dead, returning the rows that were timed out."
  [stale-minutes :- ms/PositiveInt]
  (reap-transform-runs! :last_heartbeat stale-minutes :minute "Timed out: crashed"))

(mu/defn cancel-old-canceling-runs! :- [:maybe [:vector ::canceled-run]]
  "Atomically force-cancel the active runs whose cancelation requests are older than `age` `unit`s, returning the
  pre-update rows with the `:request_time` of their cancelation, under the row locks of one transaction so that a
  concurrent `cancel-run!` or `timeout-run!` blocks until it commits."
  [age  :- ms/PositiveInt
   unit :- :keyword]
  (t2/with-transaction [_conn]
    (let [times  (into {} (map (juxt :run_id :time))
                       (transforms.db/cancelations-requested-before age unit))
          locked (when (seq times)
                   (transforms.db/lock-active-runs (keys times)))]
      (when (seq locked)
        (transforms.db/cancel-active-runs! (mapv :id locked))
        (cancel/delete-old-canceling-runs!))
      (mapv #(assoc % :request_time (times (:id %)))
            (when (seq locked)
              (transforms.db/runs (mapv :id locked)))))))

(defmethod mi/write-fns :model/TransformRun
  [_model]
  {:update! update-run!})

;;; --------------------------------------------- Job and DAG runs ---------------------------------------------

(mu/defn start-job-run! :- ::transforms.schema/transform-job-run
  "Start a run of the job `job-id`, whose insert hook snapshots the job's name and entity_id so that the run stays
  displayable after the job is deleted."
  [job-id     :- ms/PositiveInt
   run-method :- [:enum :manual :cron]]
  (transforms.db/insert-job-run! {:job_id     job-id
                                  :run_method run-method
                                  :status     :started
                                  :is_active  true}))

(mu/defn start-dag-run! :- ::transforms.schema/transform-dag-run
  "Start a DAG-reprocess run seeded from `source-transform-id` and traversing `direction`, for the `user-id` who
  triggered it and the `transform-count` of transforms its plan selected, whose insert hook snapshots the seed
  transform's name and entity_id."
  [source-transform-id :- ::lib.schema.id/transform
   direction           :- [:enum :upstream :downstream]
   user-id             :- [:maybe ::lib.schema.id/user]
   transform-count     :- :int]
  (transforms.db/insert-dag-run! {:source_transform_id source-transform-id
                                  :direction           direction
                                  :transform_count     transform-count
                                  :user_id             user-id
                                  :status              :started
                                  :is_active           true}))

(mu/defn touch-active-job-run! :- :int
  "Stamp `updated_at` on the active job run `run-id`."
  [run-id :- ms/PositiveInt]
  (transforms.db/touch-active-job-run! run-id))

(mu/defn touch-active-dag-run! :- :int
  "Stamp `updated_at` on the active DAG run `run-id`."
  [run-id :- ms/PositiveInt]
  (transforms.db/touch-active-dag-run! run-id))

(mu/defn finish-active-job-run! :- :int
  "Apply `changes` to the job run `run-id` if it is still active, returning the number of runs updated."
  [run-id  :- ms/PositiveInt
   changes :- ::transforms.schema/transform-job-run.changes]
  (transforms.db/finish-active-job-run! run-id (with-times changes)))

(mu/defn finish-active-dag-run! :- :int
  "Apply `changes` to the DAG run `run-id` if it is still active, returning the number of runs updated."
  [run-id  :- ms/PositiveInt
   changes :- ::transforms.schema/transform-dag-run.changes]
  (transforms.db/finish-active-dag-run! run-id (with-times changes)))
