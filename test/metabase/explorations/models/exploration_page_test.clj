(ns metabase.explorations.models.exploration-page-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest perms-delegate-to-block-test
  (testing "read/write perms delegate through block → thread → exploration"
    (mt/with-temp [:model/User owner {}
                   :model/Card metric {:type :metric :creator_id (:id owner)}
                   :model/Exploration e {:name "x" :creator_id (:id owner)}
                   :model/ExplorationThread t {:exploration_id (:id e)}
                   :model/ExplorationBlock b {:exploration_thread_id (:id t)}
                   :model/ExplorationPage p {:exploration_block_id (:id b)
                                             :card_id (:id metric)
                                             :dimension_id "d1"
                                             :query_type "default"}]
      (mt/with-current-user (:id owner)
        (is (true? (mi/can-read?  :model/ExplorationPage (:id p))))
        (is (true? (mi/can-write? :model/ExplorationPage (:id p)))))
      (testing "entity_id + timestamps populated"
        (let [reloaded (t2/select-one :model/ExplorationPage :id (:id p))]
          (is (some? (:entity_id reloaded)))
          (is (some? (:created_at reloaded)))
          (is (some? (:updated_at reloaded))))))))
