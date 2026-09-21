(ns metabase.explorations.models.exploration-block-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest json-transforms-roundtrip-test
  (testing ":metrics and :dimensions roundtrip through JSON transforms"
    (mt/with-temp [:model/User u {}
                   :model/Exploration e {:name "x" :creator_id (:id u)}
                   :model/ExplorationThread t {:exploration_id (:id e)}
                   :model/ExplorationBlock g
                   {:exploration_thread_id (:id t)
                    :metrics               [{:card_id 7 :dimension_mappings [{:dimension-id "d1"}]}]
                    :dimensions            [{:dimension-id "d1" :display-name "Price"
                                             :effective-type "type/Number"}]}]
      (let [reloaded (t2/select-one :model/ExplorationBlock :id (:id g))]
        (is (= [{:card_id 7 :dimension_mappings [{:dimension-id "d1"}]}]
               (:metrics reloaded)))
        (is (= [{:dimension-id "d1" :display-name "Price" :effective-type :type/Number}]
               (:dimensions reloaded))
            "effective-type is keywordized on read by the model transform")
        (testing "timestamps populated"
          (is (some? (:created_at reloaded)))
          (is (some? (:updated_at reloaded))))))))

(deftest perms-delegate-to-thread-test
  (testing "read/write perms delegate to the owning thread/exploration"
    (mt/with-temp [:model/User owner {}
                   :model/Exploration e {:name "x" :creator_id (:id owner)}
                   :model/ExplorationThread t {:exploration_id (:id e)}
                   :model/ExplorationBlock g {:exploration_thread_id (:id t)}]
      (mt/with-current-user (:id owner)
        (is (true? (mi/can-read?  :model/ExplorationBlock (:id g))))
        (is (true? (mi/can-write? :model/ExplorationBlock (:id g))))))))
