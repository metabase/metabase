(ns metabase.explorations.models.exploration-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest exploration-creates-entity-id-test
  (mt/with-temp [:model/User u {}
                 :model/Exploration e {:name "x" :creator_id (:id u)}]
    (is (= 21 (count (:entity_id e))))
    (testing "timestamps are populated"
      (is (some? (:created_at e)))
      (is (some? (:updated_at e))))))

(deftest exploration-can-read-write-test
  (mt/with-temp [:model/User owner {}
                 :model/User other {}
                 :model/Exploration e {:name "x" :creator_id (:id owner)}]
    (testing "owner can read and write"
      (binding [api/*current-user-id* (:id owner) api/*is-superuser?* false]
        (is (true? (mi/can-read?  :model/Exploration (:id e))))
        (is (true? (mi/can-write? :model/Exploration (:id e))))))
    (testing "other user cannot read or write"
      (binding [api/*current-user-id* (:id other) api/*is-superuser?* false]
        (is (false? (mi/can-read?  :model/Exploration (:id e))))
        (is (false? (mi/can-write? :model/Exploration (:id e))))))
    (testing "superuser can read and write"
      (binding [api/*current-user-id* (:id other) api/*is-superuser?* true]
        (is (true? (mi/can-read?  :model/Exploration (:id e))))
        (is (true? (mi/can-write? :model/Exploration (:id e))))))))

(deftest exploration-thread-perms-delegate-to-exploration-test
  (mt/with-temp [:model/User owner {}
                 :model/User other {}
                 :model/Exploration e {:name "x" :creator_id (:id owner)}
                 :model/ExplorationThread t {:exploration_id (:id e)}]
    (binding [api/*current-user-id* (:id owner) api/*is-superuser?* false]
      (is (true? (mi/can-read? :model/ExplorationThread (:id t)))))
    (binding [api/*current-user-id* (:id other) api/*is-superuser?* false]
      (is (false? (mi/can-read? :model/ExplorationThread (:id t)))))))

(deftest exploration-thread-json-transforms-test
  (mt/with-temp [:model/User u {}
                 :model/Card metric {:type :metric :creator_id (:id u)}
                 :model/Exploration e {:name "x" :creator_id (:id u)}
                 :model/ExplorationThread t {:exploration_id (:id e)}
                 :model/ExplorationThreadMetric m {:exploration_thread_id (:id t)
                                                   :card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1"
                                                                         :table_id 1
                                                                         :target ["field" {} 1]}]}
                 :model/ExplorationQuery q {:exploration_thread_id (:id t)
                                            :card_id (:id metric)
                                            :dimension_ids ["d1"]
                                            :dataset_query {:database 1 :type :query}}]
    (testing "ExplorationThreadMetric.dimension_mappings round-trips through JSON"
      (let [reread (t2/select-one :model/ExplorationThreadMetric :id (:id m))]
        (is (= "d1" (-> reread :dimension_mappings first :dimension_id)))))
    (testing "ExplorationQuery transforms"
      (let [reread (t2/select-one :model/ExplorationQuery :id (:id q))]
        (is (= ["d1"] (:dimension_ids reread)))
        (is (= 1 (-> reread :dataset_query :database)))))))

(deftest hydrate-threads-on-exploration-test
  (mt/with-temp [:model/User u {}
                 :model/Exploration e {:name "x" :creator_id (:id u)}
                 :model/ExplorationThread _t1 {:exploration_id (:id e) :position 0}
                 :model/ExplorationThread _t2 {:exploration_id (:id e) :position 1}]
    (let [hydrated (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :threads)]
      (is (= 2 (count (:threads hydrated))))
      (is (= [0 1] (mapv :position (:threads hydrated)))))))
