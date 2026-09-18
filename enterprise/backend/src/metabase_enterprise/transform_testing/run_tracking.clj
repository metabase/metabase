(ns metabase-enterprise.transform-testing.run-tracking
  "Cluster-safe lifecycle tracking for transform test runs."
  (:require
   [metabase-enterprise.transform-testing.db :as transform-testing.db]
   [metabase-enterprise.transform-testing.schema :as transform-testing.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.run-tracking.core :as rt]
   [metabase.task.core :as task]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private heartbeat-stale-minutes 5)

(defonce ^:private active-runs
  (atom #{}))

(mu/defn start-run! :- ::transform-testing.schema/transform-test-run
  "Create a started run for `transform-test-id` and register it as owned by this process."
  ([transform-test-id :- ms/PositiveInt]
   (start-run! transform-test-id nil))
  ([transform-test-id :- ms/PositiveInt
    initiated-by      :- [:maybe ::lib.schema.id/user]]
   (let [run (transform-testing.db/insert-transform-test-run! transform-test-id initiated-by)]
     (swap! active-runs conj (:id run))
     run)))

(mu/defn finish-run!
  "Finish `run-id` if it is still started, then release this process's ownership.

  The status guard prevents a late completion from overwriting a timeout assigned by the cluster reaper."
  [run-id :- ms/PositiveInt
   status :- ::transform-testing.schema/run-status]
  (try
    (transform-testing.db/finish-started-transform-test-run! run-id status)
    (finally
      (swap! active-runs disj run-id))))

(defn heartbeat-runs!
  "Stamp a heartbeat on the given runs while they are still started."
  [run-ids]
  (rt/heartbeat-ids! :model/TransformTestRun [:status "started"] :last_heartbeat run-ids))

(defn heartbeat-and-reconcile-runs!
  "Heartbeat the runs owned by this process and forget any that became terminal elsewhere."
  []
  (rt/heartbeat-and-reconcile! {:model      :model/TransformTestRun
                                :active     [:status "started"]
                                :ids        @active-runs
                                :heartbeat! heartbeat-runs!
                                :on-gone    #(swap! active-runs disj %)}))

(defn reap-orphaned-runs!
  "Time out started runs whose owning process has stopped heartbeating."
  [stale-minutes]
  (rt/reap-orphaned! {:model    :model/TransformTestRun
                      :active   [:status "started"]
                      :stale    [{:column :last_heartbeat :age stale-minutes :unit :minute}]
                      :terminal {:status "timeout" :end_time :%now}}))

(defmethod task/init! ::TransformTestRunHeartbeat [_]
  (rt/start-heartbeat! heartbeat-and-reconcile-runs! 1))

(defmethod task/init! ::TransformTestRunReaper [_]
  (rt/schedule-reaper! {:job-key "metabase.transform-testing.reaper"
                        :label   "transform test run"
                        :reap-fn #(reap-orphaned-runs! heartbeat-stale-minutes)}))
