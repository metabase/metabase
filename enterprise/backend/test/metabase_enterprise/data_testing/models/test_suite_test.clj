(ns metabase-enterprise.data-testing.models.test-suite-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(defn- minutes-ago ^OffsetDateTime [^long n]
  (.minusMinutes (OffsetDateTime/now ZoneOffset/UTC) n))

(defn- recent?
  [timestamp]
  (.isAfter ^OffsetDateTime timestamp (minutes-ago 1)))

(defn- members
  "The members of the suite `suite-id`, as a set of `[test-type test-entity-id]`."
  [suite-id]
  (set (data-testing.test-util/member-refs suite-id)))

(deftest deleting-a-test-removes-it-from-every-suite-test
  (mt/with-temp [:model/Card          {card-id :id}        {}
                 :model/CardTest      {card-test-id :id
                                       card-eid :entity_id} {:card_id card-id}
                 :model/CardTest      {kept-eid :entity_id} {:card_id card-id}
                 :model/Transform     {transform-id :id}   {}
                 :model/TransformTest {transform-test-id :id
                                       transform-eid :entity_id} {:transform_id transform-id}
                 :model/TestSuite     {suite-1 :id}        {}
                 :model/TestSuite     {suite-2 :id}        {}]
    (t2/insert! :model/TestSuiteMember
                [{:suite_id suite-1 :test_type :card :test_entity_id card-eid :position 0}
                 {:suite_id suite-1 :test_type :card :test_entity_id kept-eid :position 1}
                 {:suite_id suite-1 :test_type :transform :test_entity_id transform-eid :position 2}
                 {:suite_id suite-2 :test_type :card :test_entity_id card-eid :position 0}])
    (testing "deleting a card test removes it from both suites, and nothing else"
      (t2/delete! :model/CardTest :id card-test-id)
      (is (= #{[:card kept-eid] [:transform transform-eid]} (members suite-1)))
      (is (= #{} (members suite-2))))
    (testing "deleting a transform test removes it"
      (t2/delete! :model/TransformTest :id transform-test-id)
      (is (= #{[:card kept-eid]} (members suite-1))))))

(deftest test-suite-audit-events-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/TestSuite {suite-id :id} {:creator_id  (mt/user->id :crowberto)
                                                      :name        "Nightly"
                                                      :description "abc"}]
        (testing "create names the creator"
          (is (= {:model_id suite-id
                  :user_id  (mt/user->id :crowberto)
                  :details  {:name "Nightly" :description "abc"}
                  :topic    :test-suite-create
                  :model    "TestSuite"}
                 (mt/latest-audit-log-entry :test-suite-create suite-id))))
        (testing "update names the acting user"
          (t2/update! :model/TestSuite :id suite-id {:name "Renamed"})
          (is (= {:model_id suite-id
                  :user_id  (mt/user->id :rasta)
                  :details  {:name "Renamed" :description "abc"}
                  :topic    :test-suite-update
                  :model    "TestSuite"}
                 (mt/latest-audit-log-entry :test-suite-update suite-id))))
        (testing "delete names the acting user"
          (t2/delete! :model/TestSuite :id suite-id)
          (is (= {:model_id suite-id
                  :user_id  (mt/user->id :rasta)
                  :details  {:name "Renamed" :description "abc"}
                  :topic    :test-suite-delete
                  :model    "TestSuite"}
                 (mt/latest-audit-log-entry :test-suite-delete suite-id))))))))

(deftest suite-run-lifecycle-test
  (mt/with-temp [:model/TestSuite {suite-id :id} {}]
    (let [initiated-by             (mt/user->id :crowberto)
          {run-id :id :as started} (data-testing.run-tracking/start-suite-run! suite-id initiated-by)
          members                  [{:test_type :card :test_entity_id "abc" :position 0 :status :missing}]]
      (testing "a new run is started, with no members yet"
        (is (=? {:suite_id suite-id :initiated_by initiated-by :status :started :end_time nil :members nil}
                started)))
      (testing "the owning process heartbeats its run"
        (t2/update! :model/TestSuiteRun :id run-id {:last_heartbeat (minutes-ago 10)})
        (data-testing.run-tracking/heartbeat-and-reconcile-runs!)
        (is (recent? (t2/select-one-fn :last_heartbeat :model/TestSuiteRun :id run-id))))
      (testing "finishing sets the status, the end time and the member outcomes"
        (is (= 1 (data-testing.run-tracking/finish-suite-run! run-id :failed members)))
        (is (=? {:status :failed :end_time some? :members members}
                (t2/select-one :model/TestSuiteRun :id run-id)))))))

(deftest reap-orphaned-suite-runs-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/TestSuite    {suite-id :id} {}
                   :model/TestSuiteRun {stale-id :id} {:suite_id       suite-id
                                                       :initiated_by   (mt/user->id :rasta)
                                                       :last_heartbeat (minutes-ago 10)}
                   :model/TestSuiteRun {fresh-id :id} {:suite_id suite-id :last_heartbeat (minutes-ago 1)}]
      (testing "only a stale started run is timed out"
        (is (= [stale-id] (mapv :id (data-testing.run-tracking/reap-orphaned-suite-runs! 5))))
        (is (= :timeout (t2/select-one-fn :status :model/TestSuiteRun :id stale-id)))
        (is (= :started (t2/select-one-fn :status :model/TestSuiteRun :id fresh-id))))
      (testing "the timeout is audited, naming the user who started the run"
        (is (= {:model_id stale-id
                :user_id  (mt/user->id :rasta)
                :details  {:suite_id suite-id :status "timeout"}
                :topic    :test-suite-run-timeout
                :model    "TestSuiteRun"}
               (mt/latest-audit-log-entry :test-suite-run-timeout stale-id))))
      (testing "a late completion cannot overwrite the timeout"
        (is (zero? (data-testing.run-tracking/finish-suite-run! stale-id :passed [])))
        (is (= :timeout (t2/select-one-fn :status :model/TestSuiteRun :id stale-id)))))))

(deftest suite-run-start-is-audited-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/TestSuite {suite-id :id} {}]
      (let [{run-id :id} (data-testing.run-tracking/start-suite-run! suite-id (mt/user->id :rasta))]
        (try
          (is (= {:model_id run-id
                  :user_id  (mt/user->id :rasta)
                  :details  {:suite_id suite-id :status "started"}
                  :topic    :test-suite-run-start
                  :model    "TestSuiteRun"}
                 (mt/latest-audit-log-entry :test-suite-run-start run-id)))
          (finally
            (data-testing.run-tracking/finish-suite-run! run-id :error nil)))))))

(deftest deleting-a-suite-keeps-its-runs-test
  (mt/with-temp [:model/TestSuite    {suite-id :id} {}
                 :model/TestSuiteRun {run-id :id}   {:suite_id suite-id :status :passed}]
    (t2/delete! :model/TestSuite :id suite-id)
    (is (=? {:suite_id nil :status :passed} (t2/select-one :model/TestSuiteRun :id run-id)))))

(deftest a-throw-for-test-runs-does-not-stop-the-suite-run-heartbeat-test
  (mt/with-temp [:model/TestSuite     {suite-id :id}  {}
                 :model/Transform     {transform-id :id} {}
                 :model/TransformTest {test-id :id}   {:transform_id transform-id}]
    ;; The test-run heartbeat runs only while this process owns a test run, so one is started.
    (let [{run-id :id}      (data-testing.run-tracking/start-suite-run! suite-id nil)
          {test-run-id :id} (data-testing.run-tracking/start-run! :transform test-id)]
      (try
        (doseq [[thrown-name throwable] [["an exception" (ex-info "boom" {})]
                                         ["an error" (AssertionError. "boom")]]]
          (testing (str thrown-name " in the test-run heartbeat still lets the suite runs heartbeat")
            (t2/update! :model/TestSuiteRun :id run-id {:last_heartbeat (minutes-ago 10)})
            (mt/with-dynamic-fn-redefs [data-testing.run-tracking/heartbeat-runs! (fn [_] (throw throwable))]
              (data-testing.run-tracking/heartbeat-and-reconcile-runs!))
            (is (recent? (t2/select-one-fn :last_heartbeat :model/TestSuiteRun :id run-id)))))
        (testing "an interrupt is not swallowed, so the heartbeat thread can be stopped"
          (mt/with-dynamic-fn-redefs [data-testing.run-tracking/heartbeat-runs! (fn [_] (throw (InterruptedException.)))]
            (is (thrown? InterruptedException (data-testing.run-tracking/heartbeat-and-reconcile-runs!)))))
        (finally
          (data-testing.run-tracking/finish-suite-run! run-id :error nil)
          (data-testing.run-tracking/finish-run! test-run-id :error))))))
