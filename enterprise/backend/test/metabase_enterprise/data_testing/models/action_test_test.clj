(ns metabase-enterprise.data-testing.models.action-test-test
  "ActionTest model behavior: JSON columns, and the newest run."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest json-columns-round-trip-test
  (mt/with-actions [_                   {:type :model :dataset_query (data-testing.test-util/categories-query)}
                    {:keys [action-id]} {}]
    (mt/with-temp [:model/ActionTest {test-id :id}  {:action_id  action-id
                                                     :parameters {"id" 1 "name" "Wood"}
                                                     :expectations [{:type "empty" :name "e" :sql "SELECT 1 WHERE 1 = 0"}]}
                   :model/ActionTest {other-id :id} {:action_id action-id}]
      (testing "the parameter values read back with their string keys"
        (is (= {"id" 1 "name" "Wood"} (t2/select-one-fn :parameters :model/ActionTest :id test-id))))
      (testing "the expectations read back normalized"
        (is (= [{:type :empty :name "e" :sql "SELECT 1 WHERE 1 = 0"}]
               (t2/select-one-fn :expectations :model/ActionTest :id test-id))))
      (testing "a test without parameter values has none"
        (is (nil? (t2/select-one-fn :parameters :model/ActionTest :id other-id))))
      (testing "a parameter value that is not a scalar is refused"
        (is (thrown? Exception (t2/update! :model/ActionTest :id other-id {:parameters {"id" [1 2]}})))
        (is (nil? (t2/select-one-fn :parameters :model/ActionTest :id other-id)))))))

(deftest last-run-hydration-finds-only-action-runs-test
  (mt/with-actions [_                   {:type :model :dataset_query (data-testing.test-util/categories-query)}
                    {:keys [action-id]} {}]
    (mt/with-temp [:model/ActionTest  {test-id :id :as action-test} {:action_id action-id}
                   :model/DataTestRun _                             {:test_type :action, :test_id test-id}
                   :model/DataTestRun {action-run :id}              {:test_type :action, :test_id test-id}
                   :model/DataTestRun _                             {:test_type :card, :test_id test-id}]
      (testing "the newest run of the test, not a run of a card test with the same id"
        (is (= action-run (-> (t2/hydrate action-test :last_run) :last_run :id)))))))
