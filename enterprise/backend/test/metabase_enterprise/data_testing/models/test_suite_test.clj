(ns metabase-enterprise.data-testing.models.test-suite-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- members
  "The members of the suite `suite-id`, as `[test-type test-entity-id]`."
  [suite-id]
  (set (t2/select-fn-vec (juxt :test_type :test_entity_id) :model/TestSuiteMember :suite_id suite-id)))

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
