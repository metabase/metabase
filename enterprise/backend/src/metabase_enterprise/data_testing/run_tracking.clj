(ns metabase-enterprise.data-testing.run-tracking
  "Cluster-safe lifecycle tracking for the runs of every type of test."
  (:require
   [medley.core :as m]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.run-tracking.core :as rt]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private heartbeat-stale-minutes 5)

(defonce ^:private active-runs
  (atom #{}))

(def ^:private run-topics
  ;; The audit topics of each test type's runs.
  {:transform {:start   :event/transform-test-run-start
               :timeout :event/transform-test-run-timeout}})

(mu/defn start-run! :- ::data-testing.schema/data-test-run
  "Create a started run of the `test-type` test `test-id`, publish the start event of `test-type`, and register the run
  as owned by this process."
  ([test-type :- ::data-testing.schema/test-type
    test-id   :- ms/PositiveInt]
   (start-run! test-type test-id nil))
  ([test-type    :- ::data-testing.schema/test-type
    test-id      :- ms/PositiveInt
    initiated-by :- [:maybe ::lib.schema.id/user]]
   (let [run (data-testing.db/insert-test-run! test-type test-id initiated-by)]
     (events/publish-event! (get-in run-topics [test-type :start])
                            (-> {:object run}
                                (m/assoc-some :user-id initiated-by)))
     (swap! active-runs conj (:id run))
     run)))

(mu/defn finish-run!
  "Finish `run-id` if it is still started, then release this process's ownership.

  The status guard prevents a late completion from overwriting a timeout assigned by the cluster reaper."
  [run-id :- ms/PositiveInt
   status :- ::data-testing.schema/run-status]
  (try
    (data-testing.db/finish-started-test-run! run-id status)
    (finally
      (swap! active-runs disj run-id))))

(mu/defn heartbeat-runs!
  "Stamp a heartbeat on the given runs while they are still started."
  [run-ids :- [:sequential ms/PositiveInt]]
  (rt/heartbeat-ids! :model/DataTestRun [:status "started"] :last_heartbeat run-ids))

(mu/defn heartbeat-and-reconcile-runs! :- :nil
  "Heartbeat the runs owned by this process and forget any that became terminal elsewhere."
  []
  (rt/heartbeat-and-reconcile! {:model      :model/DataTestRun
                                :active     [:status "started"]
                                :ids        @active-runs
                                :heartbeat! heartbeat-runs!
                                :on-gone    #(swap! active-runs disj %)}))

(mu/defn reap-orphaned-runs! :- [:maybe [:sequential ::data-testing.schema/stored-data-test-run]]
  "Time out started runs of every test type whose owning process has stopped heartbeating, and return them. Publish
  the timeout event of each run whose test type has one."
  [stale-minutes :- ms/PositiveInt]
  (let [reaped (rt/reap-orphaned! {:model    :model/DataTestRun
                                   :active   [:status "started"]
                                   :stale    [{:column :last_heartbeat :age stale-minutes :unit :minute}]
                                   :terminal {:status "timeout" :end_time :%now}})]
    (doseq [run reaped]
      ;; A run of a test type this version does not know, written by a newer node, has no topic here.
      (if-let [topic (get-in run-topics [(:test_type run) :timeout])]
        (try
          (events/publish-event! topic
                                 (-> {:object (assoc run :status :timeout)}
                                     (m/assoc-some :user-id (:initiated_by run))))
          (catch Throwable t
            (log/warnf "Failed to publish test run timeout event for run %s: %s"
                       (:id run)
                       (ex-message t))))
        (log/warnf "Timed out run %s of test type %s, which has no timeout event" (:id run) (:test_type run))))
    reaped))

(defmethod task/init! ::DataTestRunHeartbeat [_]
  (rt/start-heartbeat! heartbeat-and-reconcile-runs! 1))

(defmethod task/init! ::DataTestRunReaper [_]
  (rt/schedule-reaper! {:job-key "metabase.transform-testing.reaper"
                        :label   "test run"
                        :reap-fn #(reap-orphaned-runs! heartbeat-stale-minutes)}))
