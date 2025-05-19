(ns metabase-enterprise.metabot-v3.models.metabot-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.models.metabot]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest metabot-entities-hydration-test
  (testing "batched hydration of metabot entities"
    (mt/with-temp
      [:model/Database {db-id :id} {}
       :model/Card card1 {:name "Test Card 1" :type :model :database_id db-id}
       :model/Card card2 {:name "Test Card 2" :type :model :database_id db-id}
       :model/Metabot {metabot1-id :id} {:name "Test Metabot 1"}
       :model/Metabot {metabot2-id :id} {:name "Test Metabot 2"}
       :model/MetabotEntity _ {:metabot_id metabot1-id :model_type "dataset" :model_id (:id card1)}
       :model/MetabotEntity _ {:metabot_id metabot1-id :model_type "dataset" :model_id (:id card2)}]

      (let [hydrated-metabots (t2/hydrate (t2/select :model/Metabot :id [:in [metabot1-id metabot2-id]]) :entities)]
        (testing "should hydrate entities for metabots with entities"
          (let [metabot1 (first (filter #(= (:id %) metabot1-id) hydrated-metabots))]
            (is (= 2 (count (:entities metabot1))))
            (is (= #{(:id card1) (:id card2)}
                   (set (map :model_id (:entities metabot1)))))))

        (testing "should return empty list for metabots without entities"
          (let [metabot2 (first (filter #(= (:id %) metabot2-id) hydrated-metabots))]
            (is (= [] (:entities metabot2)))))))))

(deftest metabot-dependencies-test
  (testing "serdes/dependencies for Metabot"
    (testing "should extract Card dependencies from entities"
      (mt/with-temp
        [:model/Database {db-id :id} {}
         :model/Card card1 {:name "Test Card 1" :type :model :database_id db-id}
         :model/Card card2 {:name "Test Card 2" :type :model :database_id db-id}
         :model/Card card3 {:name "Test Card 3" :type :metric :database_id db-id}
         :model/Metabot {metabot-id :id} {:name "Test Metabot" :description "Test description"}
         :model/MetabotEntity _ {:metabot_id metabot-id :model_type "dataset" :model_id (:id card1)}
         :model/MetabotEntity _ {:metabot_id metabot-id :model_type "dataset" :model_id (:id card2)}
         :model/MetabotEntity _ {:metabot_id metabot-id :model_type "metric" :model_id (:id card3)}]

        (let [serialized-mb (serdes/extract-one "Metabot" {} (t2/hydrate (t2/select-one :model/Metabot :id metabot-id) :entities))
              dependencies (serdes/dependencies serialized-mb)]
          (is (= #{{:model "Card" :id (:id card1)}
                   {:model "Card" :id (:id card2)}
                   {:model "Card" :id (:id card3)}}
                 dependencies)))))

    (testing "should handle empty entities"
      (mt/with-temp
        [:model/Metabot {metabot-id :id} {:name "Empty Metabot"}]
        (let [serialized-mb (serdes/extract-one "Metabot" {} (t2/hydrate (t2/select-one :model/Metabot :id metabot-id) :entities))
              dependencies (serdes/dependencies serialized-mb)]
          (is (= #{} dependencies)))))))
