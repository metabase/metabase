(ns metabase.transforms.write
  "The writes of the transform run models: TransformRun, TransformJobRun and TransformDagRun. Their hooks read no
  other row, so what a run takes from its Transform or job is read here."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.premium-features.core :as premium-features]
   [metabase.run-tracking.core :as rt]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.models.transform-run-cancelation :as cancel]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- TransformRun ---------------------------------------------------

(mu/defn start-run! :- ::transforms.schema/transform-run
  "Start a run. If `user_id` is provided in properties, it will be stored with the run
   and used for attribution in the audit log (avoiding 'External user' for scheduled runs).
   Stores the transform's `transform_name`, `transform_entity_id` and `metered_as` with the run for historical reference."
  ([transform-id :- ::lib.schema.id/transform]
   (start-run! transform-id {}))
  ([transform-id :- ::lib.schema.id/transform
    properties   :- ::transforms.schema/transform-run.update]
   (let [transform (transforms.db/transform-snapshot transform-id)
         run       (transforms.db/insert-run! (cond-> (assoc properties
                                                             :transform_id transform-id
                                                             :status :started
                                                             :is_active true)
                                                transform (assoc :transform_name      (:name transform)
                                                                 :transform_entity_id (:entity_id transform)
                                                                 :metered_as          (premium-features/transform-metered-as
                                                                                       (:source_type transform)))))]
     ;; Pass user_id to the event so audit log properly attributes the run
     (events/publish-event! :event/transform-run-start
                            (cond-> {:object run}
                              (:user_id run) (assoc :user-id (:user_id run))))
     run)))

(mu/defn succeed-started-run! :- :int
  "Mark a started run as successfully completed."
  ([run-id :- ms/PositiveInt]
   (succeed-started-run! run-id {}))
  ([run-id     :- ms/PositiveInt
    properties :- ::transforms.schema/transform-run.update]
   (u/prog1 (transforms.db/finish-active-run! run-id
                                              (merge properties
                                                     {:status    :succeeded
                                                      :is_active nil}))
     (cancel/delete-cancelation! run-id))))

(mu/defn fail-started-run! :- :int
  "Mark the started active run as failed and inactive."
  [run-id     :- ms/PositiveInt
   properties :- ::transforms.schema/transform-run.update]
  (u/prog1 (transforms.db/finish-active-run! run-id
                                             (merge properties
                                                    {:status    :failed
                                                     :is_active nil}))
    (cancel/delete-cancelation! run-id)))

(mu/defn cancel-run! :- :int
  "Cancel a started run."
  ([run-id :- ms/PositiveInt]
   (cancel-run! run-id {:message "Canceled by user"}))
  ([run-id     :- ms/PositiveInt
    properties :- ::transforms.schema/transform-run.update]
   (u/prog1 (transforms.db/finish-active-run! run-id
                                              (merge properties
                                                     {:status    :canceled
                                                      :is_active nil}))
     (cancel/delete-cancelation! run-id))))

(mu/defn- publish-timeout-event! :- :nil
  "Publish `:event/transform-run-timeout` for `run`. Wrapped so that audit-log handler
  failures don't bubble into the caller's timeout flow."
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
   (u/prog1 (transforms.db/finish-active-run! run-id
                                              (merge properties
                                                     {:message   "Timed out"
                                                      :status    :timeout
                                                      :is_active nil}))
     (cancel/delete-cancelation! run-id)
     (when (pos? <>)
       (analytics/inc! :metabase-transforms/timeouts-total {:type "transform"})
       (when-let [run (transforms.db/run run-id)]
         (publish-timeout-event! run))))))

(mu/defn- reap-transform-runs! :- [:maybe [:sequential ::transforms.schema/transform-run]]
  "Reap active transform runs by `stale-column` into a timeout carrying `message`, publishing a timeout
  event per run. See [[metabase.run-tracking.core/reap-orphaned!]]."
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
  "Time out all active runs whose `start_time` is older than the specified age. Returns the rows that were
  timed out."
  [age  :- ms/PositiveInt
   unit :- :keyword]
  (reap-transform-runs! :start_time age unit "Timed out by metabase"))

(mu/defn heartbeat-runs! :- :nil
  "Stamp `last_heartbeat = now` on the given still-active `run-ids`."
  [run-ids :- [:sequential ms/PositiveInt]]
  (rt/heartbeat-ids! :model/TransformRun [:is_active true] :last_heartbeat run-ids)
  nil)

(mu/defn reap-orphaned-runs! :- [:maybe [:sequential ::transforms.schema/transform-run]]
  "Time out active runs whose `last_heartbeat` is older than `stale-minutes` (their owning process is
  presumed dead). Returns the rows that were timed out."
  [stale-minutes :- ms/PositiveInt]
  (reap-transform-runs! :last_heartbeat stale-minutes :minute "Timed out: crashed"))

(mu/defn cancel-old-canceling-runs! :- [:maybe [:vector ::transform-run/canceled-run]]
  "Atomically force-cancels active runs whose cancelation requests are older than `age` `unit`. Returns the
  pre-update run rows we transitioned, each augmented with `:request_time` from its cancelation row, so callers
  can emit observability only for runs we actually changed.

  Race-free per app-db semantics: SELECT … FOR UPDATE row-locks the chosen runs across the transaction, so
  concurrent writers (`cancel-run!`, `timeout-run!`) block until we commit and the matching UPDATE-by-id hits
  exactly the locked rows. Rows another writer already transitioned (no longer `is_active`) simply drop out of
  the lock set and are not reported."
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

;;; ------------------------------------------------ TransformJobRun -------------------------------------------------

(mu/defn start-job-run! :- ::transforms.schema/transform-job-run
  "Start a run, storing the job's name and entity_id with it so that the run stays displayable after the job is deleted,
  since `transform_job_run.job_id` has no FK."
  ([job-id     :- ms/PositiveInt
    run-method :- [:enum :manual :cron]]
   (let [job (transforms.db/job-snapshot job-id)]
     (transforms.db/insert-job-run! (cond-> {:job_id     job-id
                                             :run_method run-method
                                             :status     :started
                                             :is_active  true}
                                      job (assoc :job_name      (some-> (:name job) str)
                                                 :job_entity_id (:entity_id job)))))))

;;; ------------------------------------------------ TransformDagRun -------------------------------------------------

(mu/defn start-dag-run! :- ::transforms.schema/transform-dag-run
  "Start a DAG-reprocess run seeded from `source-transform-id`, traversing `direction`
  (`:upstream`/`:downstream`). `user-id` is the user who triggered it; `transform-count` is the
  number of transforms the run's plan selected to run, stored for display in run listings.
  Stores the seed transform's name and entity_id with the run so it stays displayable after the transform is
  deleted (its FK is SET NULL, as for `transform_run.transform_id`)."
  [source-transform-id :- ::lib.schema.id/transform
   direction           :- [:enum :upstream :downstream]
   user-id             :- [:maybe ::lib.schema.id/user]
   transform-count     :- :int]
  (let [transform (transforms.db/transform-snapshot source-transform-id)]
    (transforms.db/insert-dag-run! (cond-> {:source_transform_id source-transform-id
                                            :direction           direction
                                            :transform_count     transform-count
                                            :user_id             user-id
                                            :status              :started
                                            :is_active           true}
                                     transform (assoc :source_transform_name      (:name transform)
                                                      :source_transform_entity_id (:entity_id transform))))))
