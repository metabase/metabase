(ns metabase.transforms.models.transform-run
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.run-tracking.core :as rt]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.transform-run-cancelation :as cancel]
   [metabase.transforms.models.util :as transforms.models.u]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize])
  (:import
   (java.time OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformRun [_model] :transform_run)

(derive :model/TransformRun :metabase/model)

(t2/deftransforms :model/TransformRun
  {:status     mi/transform-keyword
   :run_method mi/transform-keyword})

(mi/define-simple-hydration-method add-transform-runs
  :transform-runs
  "Add transform-runs for a transform. Must have :id field."
  [transform]
  (transforms.db/runs-for-transform (:id transform)))

(defn latest-runs
  "Return the latest runs for `transform-ids`."
  [transform-ids]
  (when (seq transform-ids)
    (into [] (map (comp t2.realize/realize #(dissoc % :rn)))
          (transforms.db/latest-runs-reducible transform-ids))))

(defn start-run!
  "Start a run. If `user_id` is provided in properties, it will be stored with the run
   and used for attribution in the audit log (avoiding 'External user' for scheduled runs).
   Also captures `transform_name` and `transform_entity_id` for historical reference."
  ([transform-id]
   (start-run! transform-id {}))
  ([transform-id properties]
   (let [transform  (transforms.db/transform-snapshot transform-id)
         metered-as (premium-features/transform-metered-as (:source_type transform))
         run (transforms.db/insert-run! (assoc properties
                                               :transform_id transform-id
                                               :transform_name (:name transform)
                                               :transform_entity_id (:entity_id transform)
                                               :status :started
                                               :is_active true
                                               :metered_as metered-as))]
     ;; Pass user_id to the event so audit log properly attributes the run
     (events/publish-event! :event/transform-run-start
                            (cond-> {:object run}
                              (:user_id run) (assoc :user-id (:user_id run))))
     run)))

(defn succeed-started-run!
  "Mark a started run as successfully completed."
  ([run-id]
   (succeed-started-run! run-id {}))
  ([run-id properties]
   (u/prog1 (transforms.db/finish-active-run! run-id
                                              (merge properties
                                                     {:end_time  :%now
                                                      :status    :succeeded
                                                      :is_active nil}))
     (cancel/delete-cancelation! run-id))))

(defn fail-started-run!
  "Mark the started active run as failed and inactive."
  [run-id properties]
  (u/prog1 (transforms.db/finish-active-run! run-id
                                             (merge properties
                                                    {:end_time  :%now
                                                     :status    :failed
                                                     :is_active nil}))
    (cancel/delete-cancelation! run-id)))

(defn cancel-run!
  "Cancel a started run."
  ([run-id]
   (cancel-run! run-id {:message "Canceled by user"}))
  ([run-id properties]
   (u/prog1 (transforms.db/finish-active-run! run-id
                                              (merge properties
                                                     {:end_time  :%now
                                                      :status    :canceled
                                                      :is_active nil}))
     (cancel/delete-cancelation! run-id))))

(defn- publish-timeout-event!
  "Publish `:event/transform-run-timeout` for `run`. Wrapped so that audit-log handler
  failures don't bubble into the caller's timeout flow."
  [run]
  (try
    (events/publish-event! :event/transform-run-timeout
                           (cond-> {:object run}
                             (:user_id run) (assoc :user-id (:user_id run))))
    (catch Throwable t
      (log/warnf "Failed to publish transform-run-timeout event for run %s: %s" (pr-str (:id run)) (ex-message t)))))

(defn timeout-run!
  "Mark a started run as timed out."
  ([run-id]
   (timeout-run! run-id {}))
  ([run-id properties]
   (u/prog1 (transforms.db/finish-active-run! run-id
                                              (merge properties
                                                     {:end_time  :%now
                                                      :message   "Timed out"
                                                      :status    :timeout
                                                      :is_active nil}))
     (cancel/delete-cancelation! run-id)
     (when (pos? <>)
       (analytics/inc! :metabase-transforms/timeouts-total {:type "transform"})
       (when-let [run (transforms.db/run run-id)]
         (publish-timeout-event! run))))))

(defn- reap-transform-runs!
  "Reap active transform runs by `stale-column` into a timeout carrying `message`, publishing a timeout
  event per run. See [[metabase.run-tracking.core/reap-orphaned!]]."
  [stale-column age unit message]
  (let [end-time (OffsetDateTime/now ZoneOffset/UTC)
        reaped   (rt/reap-orphaned!
                  {:model    :model/TransformRun
                   :active   [:= :is_active true]
                   :stale    [:< stale-column (rt/cutoff age unit)]
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

(defn timeout-old-runs!
  "Time out all active runs whose `start_time` is older than the specified age. Returns the rows that were
  timed out."
  [age unit]
  (reap-transform-runs! :start_time age unit "Timed out by metabase"))

(defn heartbeat-runs!
  "Stamp `last_heartbeat = now` on the given still-active `run-ids`."
  [run-ids]
  (rt/heartbeat-ids! :model/TransformRun [:= :is_active true] :last_heartbeat run-ids))

(defn reap-orphaned-runs!
  "Time out active runs whose `last_heartbeat` is older than `stale-minutes` (their owning process is
  presumed dead). Returns the rows that were timed out."
  [stale-minutes]
  (reap-transform-runs! :last_heartbeat stale-minutes :minute "Timed out: crashed"))

(defn cancel-old-canceling-runs!
  "Atomically force-cancels active runs whose cancelation requests are older than `age` `unit`. Returns the
  pre-update run rows we transitioned, each augmented with `:request_time` from its cancelation row, so callers
  can emit observability only for runs we actually changed.

  Race-free per app-db semantics: SELECT … FOR UPDATE row-locks the chosen runs across the transaction, so
  concurrent writers (`cancel-run!`, `timeout-run!`) block until we commit and the matching UPDATE-by-id hits
  exactly the locked rows. Rows another writer already transitioned (no longer `is_active`) simply drop out of
  the lock set and are not reported."
  [age unit]
  (t2/with-transaction [_conn]
    (let [cutoff (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)
          times  (into {} (map (juxt :run_id :time))
                       (transforms.db/cancelations-requested-before cutoff))
          locked (when (seq times)
                   (transforms.db/lock-active-runs (keys times)))]
      (when (seq locked)
        (transforms.db/cancel-active-runs! (mapv :id locked))
        (cancel/delete-old-canceling-runs!))
      (mapv #(assoc % :request_time (times (:id %)))
            (when (seq locked)
              (transforms.db/runs (mapv :id locked)))))))

(defn running-run-for-transform-id
  "Return a single active transform run or nil."
  [transform-id]
  (transforms.db/active-run-for-transform transform-id))

(defn last-successful-run-times
  "Map each id in `transform-ids` with a succeeded run to its most recent run's `end_time`. Ids with
  no succeeded run are absent."
  [transform-ids]
  (when (seq transform-ids)
    (into {}
          (map (juxt :transform_id :last_success))
          (transforms.db/last-success-times transform-ids))))

(def ^:private status-labels
  "Display labels for TransformRun status values."
  {"started"   (tru "In progress")
   "succeeded" (tru "Success")
   "failed"    (tru "Failed")
   "timeout"   (tru "Timeout")
   "canceling" (tru "Canceling")
   "canceled"  (tru "Canceled")})

(def ^:private run-method-labels
  "Display labels for TransformRun run_method values."
  {"manual" (tru "Manual")
   "cron"   (tru "Schedule")})

(def ^:private tag-name-labels
  "Display labels for built-in TransformTag names."
  {"hourly"  (tru "hourly")
   "daily"   (tru "daily")
   "weekly"  (tru "weekly")
   "monthly" (tru "monthly")})

(defn paged-runs
  "Return a page of the list of the runs.

  Follows the conventions used by the FE."
  [{:keys [offset limit start-time end-time run-methods transform-ids transform-tag-ids statuses user-id
           sort-column sort-direction]}]
  (let [offset            (or offset 0)
        limit             (or limit 20)
        [started-at-start started-at-end] (when start-time (transforms.models.u/timestamp-range start-time))
        [ended-at-start ended-at-end]     (when end-time (transforms.models.u/timestamp-range end-time))
        filters           {:started-at-start   started-at-start
                           :started-at-end     started-at-end
                           :ended-at-start     ended-at-start
                           :ended-at-end       ended-at-end
                           :run-methods        run-methods
                           :transform-ids      transform-ids
                           :transform-tag-ids  transform-tag-ids
                           :statuses           statuses
                           :user-id            user-id}
        runs              (transforms.db/paged-runs filters sort-column sort-direction status-labels
                                                    run-method-labels tag-name-labels limit offset)
        root-collection   (collection.root/hydrated-root-collection :transforms)]
    {:data   (->> (t2/hydrate runs [:transform :collection :transform_tag_ids])
                  (map #(update % :transform collection.root/hydrate-root-collection root-collection)))
     :limit  limit
     :offset offset
     :total  (transforms.db/paged-run-count filters)}))
