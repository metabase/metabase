(ns metabase-enterprise.data-testing.run-tracking
  "Cluster-safe lifecycle tracking for the runs of every type of test, and for the runs of test suites."
  (:require
   [medley.core :as m]
   [metabase-enterprise.data-testing.models.data-test-run :as data-testing.models.data-test-run]
   [metabase-enterprise.data-testing.models.test-suite-run :as data-testing.models.test-suite-run]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.test-type :as data-testing.test-type]
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

(defonce ^:private active-suite-runs
  (atom #{}))

(mu/defn start-run! :- ::data-testing.schema/data-test-run
  "Create a started run of the `test-type` test `test-id`, publish the start event of `test-type`, and register the run
  as owned by this process."
  ([test-type :- ::data-testing.schema/test-type
    test-id   :- ms/PositiveInt]
   (start-run! test-type test-id nil))
  ([test-type    :- ::data-testing.schema/test-type
    test-id      :- ms/PositiveInt
    initiated-by :- [:maybe ::lib.schema.id/user]]
   (let [run (data-testing.models.data-test-run/start-data-test-run! test-type test-id initiated-by)]
     (events/publish-event! (get-in (data-testing.test-type/spec test-type) [:run-topics :start])
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
    (data-testing.models.data-test-run/finish-data-test-run! run-id status)
    (finally
      (swap! active-runs disj run-id))))

(mu/defn start-suite-run! :- ::data-testing.schema/test-suite-run
  "Create a started run of the suite `suite-id`, publish its start event, and register the run as owned by this
  process."
  [suite-id     :- ms/PositiveInt
   initiated-by :- [:maybe ::lib.schema.id/user]]
  (let [run (data-testing.models.test-suite-run/start-test-suite-run! suite-id initiated-by)]
    (events/publish-event! :event/test-suite-run-start (-> {:object run}
                                                           (m/assoc-some :user-id initiated-by)))
    (swap! active-suite-runs conj (:id run))
    run))

(mu/defn finish-suite-run! :- :int
  "Finish the suite run `run-id` with `status` and `members`, its member outcomes, if the run is still started.
  Releases this process's ownership of the run either way. Returns the number of runs finished: 0 when the cluster
  reaper timed the run out first."
  [run-id  :- ms/PositiveInt
   status  :- ::data-testing.schema/run-status
   members :- [:maybe ::data-testing.schema/test-suite-run.stored-members]]
  (try
    (data-testing.models.test-suite-run/finish-test-suite-run! run-id status members)
    (finally
      (swap! active-suite-runs disj run-id))))

(mu/defn heartbeat-runs!
  "Stamp a heartbeat on the given runs while they are still started."
  [run-ids :- [:sequential ms/PositiveInt]]
  (rt/heartbeat-ids! :model/DataTestRun [:status "started"] :last_heartbeat run-ids))

(defn- call-or-log-failure
  "Call `thunk` and return its value. When `thunk` throws, log the throwable as a failure to `what`, a verb phrase such
  as \"reap test runs\", and return nil, so that the caller goes on with its other work. An `InterruptedException` is
  rethrown, so that the thread can be stopped."
  [what thunk]
  (try
    (thunk)
    (catch InterruptedException e
      (throw e))
    (catch Throwable t
      (log/warnf t "Failed to %s" what)
      nil)))

(mu/defn heartbeat-and-reconcile-runs! :- :nil
  "Heartbeat the test runs and suite runs owned by this process and forget any that became terminal elsewhere. A
  failure for one kind of run does not stop the other."
  []
  (call-or-log-failure
   "heartbeat test runs"
   #(rt/heartbeat-and-reconcile! {:model      :model/DataTestRun
                                  :active     [:status "started"]
                                  :ids        @active-runs
                                  :heartbeat! heartbeat-runs!
                                  :on-gone    (fn [id] (swap! active-runs disj id))}))
  (call-or-log-failure
   "heartbeat suite runs"
   #(rt/heartbeat-and-reconcile! {:model      :model/TestSuiteRun
                                  :active     [:status "started"]
                                  :ids        @active-suite-runs
                                  :heartbeat! (fn [ids] (rt/heartbeat-ids! :model/TestSuiteRun [:status "started"] :last_heartbeat ids))
                                  :on-gone    (fn [id] (swap! active-suite-runs disj id))}))
  nil)

(defn- reap-and-publish!
  "Time out the started runs of the run model `model` whose last heartbeat is older than `stale-minutes`, and return
  them. For each run, publish an event to the topic that `(topic-of run)` returns, or log the run when `topic-of`
  returns nil. A failed publish does not stop the others."
  [model stale-minutes topic-of]
  (let [reaped (rt/reap-orphaned! {:model    model
                                   :active   [:status "started"]
                                   :stale    [{:column :last_heartbeat :age stale-minutes :unit :minute}]
                                   :terminal {:status "timeout" :end_time :%now}})]
    (doseq [run reaped]
      (if-let [topic (topic-of run)]
        (call-or-log-failure
         (str "publish the timeout event of run " (:id run) " of " (name model))
         #(events/publish-event! topic (-> {:object (assoc run :status :timeout)}
                                           (m/assoc-some :user-id (:initiated_by run)))))
        (log/warnf "Timed out %s %s, which has no timeout event" (name model) (select-keys run [:id :test_type]))))
    reaped))

(mu/defn reap-orphaned-runs! :- [:maybe [:sequential ::data-testing.schema/stored-data-test-run]]
  "Time out started runs of every test type whose owning process has stopped heartbeating, and return them. Publish
  the timeout event of each run whose test type has one."
  [stale-minutes :- ms/PositiveInt]
  ;; A run of a test type this version does not know, written by a newer node, has no topic here.
  (reap-and-publish! :model/DataTestRun stale-minutes
                     #(get-in (data-testing.test-type/spec (:test_type %)) [:run-topics :timeout])))

(mu/defn reap-orphaned-suite-runs! :- [:maybe [:sequential ::data-testing.schema/test-suite-run]]
  "Time out started suite runs whose owning process has stopped heartbeating, publish the timeout event of each, and
  return them."
  [stale-minutes :- ms/PositiveInt]
  (reap-and-publish! :model/TestSuiteRun stale-minutes (constantly :event/test-suite-run-timeout)))

(defn reap-orphaned-test-and-suite-runs!
  "Time out the orphaned test runs and suite runs, as [[reap-orphaned-runs!]] and [[reap-orphaned-suite-runs!]] do, and
  return them. A failure to reap one kind of run does not stop the other."
  [stale-minutes]
  (concat (call-or-log-failure "reap test runs" #(reap-orphaned-runs! stale-minutes))
          (call-or-log-failure "reap suite runs" #(reap-orphaned-suite-runs! stale-minutes))))

(defmethod task/init! ::DataTestRunHeartbeat [_]
  (rt/start-heartbeat! heartbeat-and-reconcile-runs! 1))

(defmethod task/init! ::DataTestRunReaper [_]
  (rt/schedule-reaper! {:job-key "metabase.transform-testing.reaper"
                        :label   "test or suite run"
                        :reap-fn #(reap-orphaned-test-and-suite-runs! heartbeat-stale-minutes)}))
