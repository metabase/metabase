(ns metabase-enterprise.data-testing.models.action-test-test
  "ActionTest model behavior: JSON columns, and what deleting an action or its model does to the runs of its tests."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.actions.models :as actions.models]
   [metabase.collections.models.collection :as collection]
   [metabase.queries.models.card :as queries.card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest json-columns-round-trip-test
  (mt/with-actions [_                   {:type :model :dataset_query (data-testing.test-util/table-query :categories)}
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

(deftest deleting-an-action-or-its-model-clears-the-test-id-of-its-action-tests-runs-test
  (doseq [[description delete!] [["deleting the action"
                                  (fn [_coll-id _model-id action-id] (actions.models/delete-actions! [action-id]))]
                                 ["deleting the model, not archived"
                                  (fn [_coll-id model-id _action-id] (queries.card/delete-cards! [model-id]))]
                                 ["deleting the model's collection"
                                  (fn [coll-id _model-id _action-id] (collection/delete-collections! [coll-id]))]]]
    (testing description
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (mt/with-actions [{model-id :id}      {:type :model :dataset_query (data-testing.test-util/table-query :categories)
                                               :collection_id coll-id}
                          {:keys [action-id]} {}]
          (mt/with-temp [:model/ActionTest  {test-id :id} {:action_id action-id}
                         :model/DataTestRun {run-id :id}  {:test_type :action, :test_id test-id}]
            (delete! coll-id model-id action-id)
            (testing "premise: the action and its test are gone"
              (is (not (t2/exists? :model/Action :id action-id)))
              (is (not (t2/exists? :model/ActionTest :id test-id))))
            (testing "no run names the deleted test"
              (is (nil? (t2/select-one-fn :test_id :model/DataTestRun :id run-id))))))))))

(deftest deleting-a-model-clears-the-test-id-of-runs-of-tests-of-each-of-its-actions-test
  (doseq [[description delete!] [["deleting the model, not archived"
                                  (fn [_coll-id model-id] (queries.card/delete-cards! [model-id]))]
                                 ["deleting the model's collection"
                                  (fn [coll-id _model-id] (collection/delete-collections! [coll-id]))]]]
    (testing description
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (mt/with-actions [{model-id :id}         {:type :model :dataset_query (data-testing.test-util/table-query :categories)
                                                  :collection_id coll-id}
                          {first-action :action-id}  {}
                          {second-action :action-id} {}]
          (mt/with-temp [:model/ActionTest  {first-test :id}  {:action_id first-action}
                         :model/ActionTest  {second-test :id} {:action_id second-action}
                         :model/DataTestRun {first-run :id}   {:test_type :action, :test_id first-test}
                         :model/DataTestRun {second-run :id}  {:test_type :action, :test_id second-test}]
            (delete! coll-id model-id)
            (testing "premise: both actions and their tests are gone"
              (is (not (t2/exists? :model/Action :id [:in [first-action second-action]])))
              (is (not (t2/exists? :model/ActionTest :id [:in [first-test second-test]]))))
            (testing "no run names a deleted test"
              (is (= [nil nil] (mapv #(t2/select-one-fn :test_id :model/DataTestRun :id %) [first-run second-run]))))))))))
