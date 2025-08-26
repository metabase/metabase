(ns metabase-enterprise.metabot-v3.models.metabot-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.models.metabot]
   [metabase-enterprise.metabot-v3.models.metabot-prompt]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest metabot-prompts-hydration-test
  (mt/dataset test-data
    (testing "batched hydration of metabot prompts"
      (mt/with-temp
        [:model/Card {card1-id :id} {:name "Test Card 1"
                                     :type :metric
                                     :dataset_query {:database (mt/id)
                                                     :type :query
                                                     :query {:source-table (mt/id :products)}}}
         :model/Card {card2-id :id} {:name "Test Card 2"
                                     :type :model
                                     :dataset_query {:database (mt/id)
                                                     :type :query
                                                     :query {:source-table (mt/id :products)}}}
         :model/Metabot {metabot1-id :id} {:name "Test Metabot 1"}
         :model/Metabot {metabot2-id :id} {:name "Test Metabot 2"}
         :model/MetabotPrompt _ {:metabot_id metabot1-id :prompt "Prompt 1" :model :metric :card_id card1-id}
         :model/MetabotPrompt _ {:metabot_id metabot1-id :prompt "Prompt 2" :model :model :card_id card2-id}]

        (let [hydrated-metabots (t2/hydrate (t2/select :model/Metabot :id [:in [metabot1-id metabot2-id]]) :prompts)]
          (testing "should hydrate prompts for metabots with prompts"
            (let [metabot1 (first (filter #(= (:id %) metabot1-id) hydrated-metabots))]
              (is (= 2 (count (:prompts metabot1))))
              (is (= #{"Prompt 1" "Prompt 2"}
                     (set (map :prompt (:prompts metabot1)))))
              (is (= #{:metric :model}
                     (set (map :model (:prompts metabot1)))))))

          (testing "should return empty list for metabots without prompts"
            (let [metabot2 (first (filter #(= (:id %) metabot2-id) hydrated-metabots))]
              (is (= [] (:prompts metabot2))))))))))
