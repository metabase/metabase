(ns metabase.transforms.coordinated-run
  "Shared lifecycle operations for the two coordinated-run models, `transform_job_run` and
  `transform_dag_run`. Both track a multi-transform run with the same status/heartbeat lifecycle and
  differ only in their extra columns and member-run FK; helpers here are parameterized by the Toucan
  `model`."
  (:require
   [metabase.run-tracking.core :as rt]
   [metabase.transforms-base.schema :as transforms-base.schema]
   [metabase.transforms.canceling :as canceling]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.transform-run-cancelation :as transform-run-cancelation]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::run-changes
  "Changes to a row of a coordinated-run model."
  [:or
   ::transforms.schema/transform-job-run.update
   ::transforms.schema/transform-dag-run.update])

(mu/defn- touch-active-run! :- :int
  [model  :- ::transforms.schema/coordinated-run-model
   run-id :- ms/PositiveInt]
  (case model
    :model/TransformJobRun (transforms.db/touch-active-job-run! run-id)
    :model/TransformDagRun (transforms.db/touch-active-dag-run! run-id)))

(mu/defn- finish-active-run! :- :int
  [model   :- ::transforms.schema/coordinated-run-model
   run-id  :- ms/PositiveInt
   changes :- ::run-changes]
  (case model
    :model/TransformJobRun (transforms.db/finish-active-job-run! run-id changes)
    :model/TransformDagRun (transforms.db/finish-active-dag-run! run-id changes)))

(mu/defn add-run-activity! :- :int
  "Note that a run has had activity (touches `updated_at`)."
  [model  :- ::transforms.schema/coordinated-run-model
   run-id :- ms/PositiveInt]
  (touch-active-run! model run-id))

(mu/defn succeed-started-run! :- :int
  "Mark a started run as successfully completed."
  ([model  :- ::transforms.schema/coordinated-run-model
    run-id :- ms/PositiveInt]
   (succeed-started-run! model run-id {}))
  ([model      :- ::transforms.schema/coordinated-run-model
    run-id     :- ms/PositiveInt
    properties :- ::run-changes]
   (finish-active-run! model
                       run-id
                       (merge properties
                              {:status    :succeeded
                               :is_active nil}))))

(mu/defn fail-started-run! :- :int
  "Mark the started active run as failed and inactive."
  [model      :- ::transforms.schema/coordinated-run-model
   run-id     :- ms/PositiveInt
   properties :- ::run-changes]
  (finish-active-run! model
                      run-id
                      (merge properties
                             {:status    :failed
                              :is_active nil})))

(mu/defn cancel-started-run! :- :int
  "Mark an active run as canceled; a finished run is never resurrected into a canceled state.
  Returns the number of rows updated — 0 if the run had already finished."
  [model  :- ::transforms.schema/coordinated-run-model
   run-id :- ms/PositiveInt]
  (finish-active-run! model
                      run-id
                      {:status    :canceled
                       :is_active nil
                       :message   "Canceled"}))

(mu/defn cancel! :- :boolean
  "Cancel an in-progress coordinated run: mark it canceled and request cancellation of its
  still-active member transform runs — via the in-process cancel channel, plus a cancelation row so
  the cancel-runs task reaches members running on other nodes. Returns true if the run was active
  and is now canceled, false if it had already finished."
  [model     :- ::transforms.schema/coordinated-run-model
   member-fk :- [:enum :job_run_id :dag_run_id]
   run-id    :- ms/PositiveInt]
  (boolean
   (when (pos? (cancel-started-run! model run-id))
     (doseq [member-run-id (transforms.db/active-run-ids-of-parent member-fk run-id)]
       (transform-run-cancelation/mark-cancel-started-run! member-run-id)
       (canceling/chan-signal-cancel! member-run-id))
     true)))

(mu/defn heartbeat-runs! :- [:maybe [:sequential :int]]
  "Stamp `last_heartbeat = now` on the given still-active run-ids."
  [model   :- ::transforms.schema/coordinated-run-model
   run-ids :- [:sequential ms/PositiveInt]]
  (rt/heartbeat-ids! model [:is_active true] :last_heartbeat run-ids))

(mu/defn reap-orphaned-runs! :- [:maybe [:sequential [:or ::transforms.schema/transform-job-run ::transforms.schema/transform-dag-run]]]
  "Time out active runs whose `last_heartbeat` is older than `stale-minutes` (their coordinator
  process is presumed dead). `type-tag` (\"job\"/\"dag\") tags the emitted metrics. Returns the rows
  that were timed out so callers can notify."
  [model         :- ::transforms.schema/coordinated-run-model
   type-tag      :- [:enum "job" "dag"]
   stale-minutes :- ms/PositiveInt]
  (rt/reap-orphaned!
   {:model    model
    :active   [:is_active true]
    :stale    [{:column :last_heartbeat :age stale-minutes :unit :minute}]
    :terminal {:status "timeout" :end_time :%now :is_active nil :message "Timed out: crashed"}
    :metrics  {:total-metric   :metabase-transforms/timeouts-total
               :latency-metric :metabase-transforms/timeout-detection-latency-ms
               :tags           {:type type-tag}
               :latency-column :last_heartbeat
               :timeout-ms     (rt/unit->ms stale-minutes :minute)}}))

(mu/defn heartbeat-and-reconcile! :- :nil
  "Stamp a heartbeat on every active run whose id is a key of `active-runs-atom` (the runs this
  process coordinates), then deliver the `gone` promise of any that were terminated externally so
  their coordinator aborts."
  [model             :- ::transforms.schema/coordinated-run-model
   active-runs-atom  :- ::transforms-base.schema/atom]
  (rt/heartbeat-and-reconcile! {:model      model
                                :active     [:is_active true]
                                :ids        (keys @active-runs-atom)
                                :heartbeat! #(heartbeat-runs! model %)
                                :on-gone    (fn [run-id]
                                              (some-> (get @active-runs-atom run-id) (deliver true)))}))
