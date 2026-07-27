(ns metabase.transforms.coordinated-run
  "Shared lifecycle operations for the two coordinated-run models, `transform_job_run` and
  `transform_dag_run`. Both track a multi-transform run with the same status/heartbeat lifecycle and
  differ only in their extra columns and member-run FK; helpers here are parameterized by the Toucan
  `model`."
  (:require
   [metabase.run-tracking.core :as rt]
   [metabase.transforms.canceling :as canceling]
   [metabase.transforms.models.transform-run-cancelation :as transform-run-cancelation]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn add-run-activity!
  "Note that a run has had activity (touches `updated_at`)."
  [model run-id]
  (t2/update! model :id run-id :is_active true {:updated_at :%now}))

(defn succeed-started-run!
  "Mark a started run as successfully completed."
  ([model run-id]
   (succeed-started-run! model run-id {}))
  ([model run-id properties]
   (t2/update! model
               :id        run-id
               :is_active true
               (merge {:end_time :%now}
                      properties
                      {:status    :succeeded
                       :is_active nil}))))

(defn fail-started-run!
  "Mark the started active run as failed and inactive."
  [model run-id properties]
  (t2/update! model
              :id        run-id
              :is_active true
              (merge {:end_time :%now}
                     properties
                     {:status    :failed
                      :is_active nil})))

(defn cancel-started-run!
  "Mark an active run as canceled; a finished run is never resurrected into a canceled state.
  Returns the number of rows updated — 0 if the run had already finished."
  [model run-id]
  (t2/update! model
              :id        run-id
              :is_active true
              {:status    :canceled
               :is_active nil
               :end_time  :%now
               :message   "Canceled"}))

(defn cancel!
  "Cancel an in-progress coordinated run: mark it canceled and request cancellation of its
  still-active member transform runs — via the in-process cancel channel, plus a cancelation row so
  the cancel-runs task reaches members running on other nodes. Returns true if the run was active
  and is now canceled, false if it had already finished."
  [model member-fk run-id]
  (boolean
   (when (pos? (cancel-started-run! model run-id))
     (doseq [member-run-id (t2/select-pks-vec :model/TransformRun member-fk run-id :is_active true)]
       (transform-run-cancelation/mark-cancel-started-run! member-run-id)
       (canceling/chan-signal-cancel! member-run-id))
     true)))

(defn heartbeat-runs!
  "Stamp `last_heartbeat = now` on the given still-active run-ids."
  [model run-ids]
  (rt/heartbeat-ids! model [:= :is_active true] :last_heartbeat run-ids))

(defn reap-orphaned-runs!
  "Time out active runs whose `last_heartbeat` is older than `stale-minutes` (their coordinator
  process is presumed dead). `type-tag` (\"job\"/\"dag\") tags the emitted metrics. Returns the rows
  that were timed out so callers can notify."
  [model type-tag stale-minutes]
  (rt/reap-orphaned!
   {:model    model
    :active   [:= :is_active true]
    :stale    [:< :last_heartbeat (rt/cutoff stale-minutes :minute)]
    :terminal {:status "timeout" :end_time :%now :is_active nil :message "Timed out: crashed"}
    :metrics  {:total-metric   :metabase-transforms/timeouts-total
               :latency-metric :metabase-transforms/timeout-detection-latency-ms
               :tags           {:type type-tag}
               :latency-column :last_heartbeat
               :timeout-ms     (rt/unit->ms stale-minutes :minute)}}))

(defn heartbeat-and-reconcile!
  "Stamp a heartbeat on every active run whose id is a key of `active-runs-atom` (the runs this
  process coordinates), then deliver the `gone` promise of any that were terminated externally so
  their coordinator aborts."
  [model active-runs-atom]
  (rt/heartbeat-and-reconcile! {:model      model
                                :active     [:= :is_active true]
                                :ids        (keys @active-runs-atom)
                                :heartbeat! #(heartbeat-runs! model %)
                                :on-gone    (fn [run-id]
                                              (some-> (get @active-runs-atom run-id) (deliver true)))}))
