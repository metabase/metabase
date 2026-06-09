(ns metabase.explorations.models.exploration-thread-group-test
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
                   :model/ExplorationThreadGroup g
                   {:exploration_thread_id (:id t)
                    :metrics               [{:card_id 7 :dimension_mappings [{:dimension_id "d1"}]}]
                    :dimensions            [{:dimension_id "d1" :display_name "Price"
                                             :effective_type "type/Number"}]}]
      (let [reloaded (t2/select-one :model/ExplorationThreadGroup :id (:id g))]
        (is (= [{:card_id 7 :dimension_mappings [{:dimension_id "d1"}]}]
               (:metrics reloaded)))
        (is (= [{:dimension_id "d1" :display_name "Price" :effective_type :type/Number}]
               (:dimensions reloaded))
            "effective_type is keywordized on read by the model transform")
        (testing "timestamps populated"
          (is (some? (:created_at reloaded)))
          (is (some? (:updated_at reloaded))))))))

(deftest perms-delegate-to-thread-test
  (testing "read/write perms delegate to the owning thread/exploration"
    (mt/with-temp [:model/User owner {}
                   :model/Exploration e {:name "x" :creator_id (:id owner)}
                   :model/ExplorationThread t {:exploration_id (:id e)}
                   :model/ExplorationThreadGroup g {:exploration_thread_id (:id t)}]
      (mt/with-current-user (:id owner)
        (is (true? (mi/can-read?  :model/ExplorationThreadGroup (:id g))))
        (is (true? (mi/can-write? :model/ExplorationThreadGroup (:id g))))))))

(deftest exploration-query-group-id-roundtrip-test
  (testing "exploration_query persists and reads back group_id"
    (mt/with-temp [:model/User u {}
                   :model/Card metric {:type :metric :creator_id (:id u)}
                   :model/Exploration e {:name "x" :creator_id (:id u)}
                   :model/ExplorationThread t {:exploration_id (:id e)}
                   :model/ExplorationThreadGroup g {:exploration_thread_id (:id t)}
                   :model/ExplorationQuery q {:exploration_thread_id (:id t)
                                              :card_id (:id metric)
                                              :dimension_id "d1"
                                              :group_id (:id g)
                                              :dataset_query {:database 1 :type :query}}]
      (is (= (:id g) (:group_id (t2/select-one [:model/ExplorationQuery :group_id] :id (:id q))))))))
