(ns metabase-enterprise.metabot-v3.models.metabot-use-case-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.models.metabot-use-case :as metabot-use-case]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest use-case-for-metabot-test
  (testing "returns existing use case by name"
    (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                   :model/MetabotUseCase {uc-id :id} {:metabot_id metabot-id
                                                      :name "transforms"
                                                      :enabled true}]
      (let [use-case (metabot-use-case/use-case-for-metabot metabot-id "transforms")]
        (is (= uc-id (:id use-case)))
        (is (= "transforms" (:name use-case)))
        (is (true? (:enabled use-case))))))

  (testing "returns nil for non-existent use case name"
    (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}]
      (is (nil? (metabot-use-case/use-case-for-metabot metabot-id "nonexistent")))))

  (testing "returns nil for non-existent metabot"
    (is (nil? (metabot-use-case/use-case-for-metabot Integer/MAX_VALUE "omnibot")))))

(deftest use-cases-hydration-test
  (testing "batched hydration of use_cases for metabots"
    (mt/with-temp [:model/Metabot {metabot1-id :id} {:name "Test Metabot 1"}
                   :model/Metabot {metabot2-id :id} {:name "Test Metabot 2"}
                   :model/MetabotUseCase _ {:metabot_id metabot1-id :name "nlq" :enabled false}
                   :model/MetabotUseCase _ {:metabot_id metabot1-id :name "sql" :enabled false}
                   :model/MetabotUseCase _ {:metabot_id metabot1-id :name "transforms" :enabled true}
                   :model/MetabotUseCase _ {:metabot_id metabot1-id :name "omnibot" :enabled true}
                   :model/MetabotUseCase _ {:metabot_id metabot2-id :name "embedding" :enabled true}]
      (let [hydrated (t2/hydrate (t2/select :model/Metabot :id [:in [metabot1-id metabot2-id]]) :use_cases)
            metabot1 (first (filter #(= (:id %) metabot1-id) hydrated))
            metabot2 (first (filter #(= (:id %) metabot2-id) hydrated))]
        (testing "metabot1 has 4 use cases"
          (is (= 4 (count (:use_cases metabot1))))
          (is (= #{"nlq" "omnibot" "sql" "transforms"}
                 (set (map :name (:use_cases metabot1))))))

        (testing "metabot2 has 1 use case"
          (is (= 1 (count (:use_cases metabot2))))
          (is (= "embedding" (:name (first (:use_cases metabot2))))))

        (testing "use cases are sorted by name"
          (is (= ["nlq" "omnibot" "sql" "transforms"]
                 (map :name (:use_cases metabot1))))))))

  (testing "hydration returns empty list for metabot with no use cases"
    (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Empty Metabot"}]
      (let [hydrated (first (t2/hydrate [(t2/select-one :model/Metabot :id metabot-id)] :use_cases))]
        (is (= [] (:use_cases hydrated)))))))

(deftest default-use-cases-exist-test
  (testing "internal metabot has default use cases after migration"
    (let [internal-entity-id (get-in metabot-v3.config/metabot-config
                                     [metabot-v3.config/internal-metabot-id :entity-id])
          metabot-id (t2/select-one-pk :model/Metabot :entity_id internal-entity-id)]
      (when metabot-id
        (let [use-cases (t2/select :model/MetabotUseCase :metabot_id metabot-id {:order-by [[:name :asc]]})]
          (is (= 4 (count use-cases)))
          (is (= ["nlq" "omnibot" "sql" "transforms"]
                 (map :name use-cases)))))))

  (testing "embedded metabot has default use cases after migration"
    (let [embedded-entity-id (get-in metabot-v3.config/metabot-config
                                     [metabot-v3.config/embedded-metabot-id :entity-id])
          metabot-id (t2/select-one-pk :model/Metabot :entity_id embedded-entity-id)]
      (when metabot-id
        (let [use-cases (t2/select :model/MetabotUseCase :metabot_id metabot-id)]
          (is (= 1 (count use-cases)))
          (is (= "embedding" (:name (first use-cases)))))))))
