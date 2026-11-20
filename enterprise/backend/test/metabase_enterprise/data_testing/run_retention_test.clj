(ns metabase-enterprise.data-testing.run-retention-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.data-testing.run-retention :as data-testing.run-retention]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private result
  {:message "The query under test failed to run." :error-code "transform-test.query-failed"})

(defn- days-ago
  [days]
  (t/minus (t/offset-date-time) (t/days days)))

(defn- stored-result
  [run-id]
  (t2/select-one-fn :result [:model/DataTestRun :result] :id run-id))

(deftest clear-expired-run-results-test
  (mt/with-temp [:model/DataTestRun {old-id :id}    {:status :error, :start_time (days-ago 8), :result result}
                 :model/DataTestRun {recent-id :id} {:status :error, :start_time (days-ago 6), :result result}]
    (testing "with retention off, every result is kept"
      (mt/with-temporary-setting-values [data-test-run-result-retention-days 0]
        (is (zero? (data-testing.run-retention/clear-expired-run-results!)))
        (is (= result (stored-result old-id)))))
    (testing "the results of the runs older than the retention period are cleared, and the runs stay"
      (mt/with-temporary-setting-values [data-test-run-result-retention-days 7]
        (data-testing.run-retention/clear-expired-run-results!)
        (is (nil? (stored-result old-id)))
        (is (= :error (t2/select-one-fn :status :model/DataTestRun :id old-id)))
        (is (= result (stored-result recent-id)))))))

(deftest delete-expired-runs-test
  (mt/with-temp [:model/Transform     {transform-id :id} {}
                 :model/TransformTest {active-id :id}    {:transform_id transform-id}
                 :model/TransformTest {idle-id :id}      {:transform_id transform-id}
                 :model/DataTestRun   {old-id :id}       {:test_id active-id, :status :failed, :start_time (days-ago 9)}
                 :model/DataTestRun   {older-id :id}     {:test_id active-id, :status :passed, :start_time (days-ago 20)}
                 :model/DataTestRun   {recent-id :id}    {:test_id active-id, :status :passed, :start_time (days-ago 6)}
                 :model/DataTestRun   {idle-old-id :id}  {:test_id idle-id, :status :passed, :start_time (days-ago 30)}
                 :model/DataTestRun   {idle-last-id :id} {:test_id idle-id, :status :failed, :start_time (days-ago 9)}
                 :model/DataTestRun   {orphan-id :id}    {:test_id nil, :status :failed, :start_time (days-ago 9)}
                 :model/DataTestRun   {started-id :id}   {:test_id active-id, :status :started, :start_time (days-ago 9)}]
    (let [remaining (fn []
                      (t2/select-pks-set :model/DataTestRun
                                         :id [:in [old-id older-id recent-id idle-old-id idle-last-id orphan-id
                                                   started-id]]))]
      (testing "with retention off, every run is kept"
        (mt/with-temporary-setting-values [data-test-run-retention-days 0]
          (is (zero? (data-testing.run-retention/delete-expired-runs!)))
          (is (= 7 (count (remaining))))))
      (testing "runs older than the retention period are deleted"
        (mt/with-temporary-setting-values [data-test-run-retention-days 7]
          (data-testing.run-retention/delete-expired-runs!)
          (testing "but not a recent run, the newest run of a test that has not run since, or a run still started"
            (is (= #{recent-id idle-last-id started-id} (remaining)))))))))
