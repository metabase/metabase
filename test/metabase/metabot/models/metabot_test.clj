(ns metabase.metabot.models.metabot-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.metabot.models.metabot :as metabot]
   [metabase.metabot.models.metabot-prompt]
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

(deftest update-metabots-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Collection {collection-id :id} {}
                 :model/Metabot    {m1 :id} {:name "Metabot 1" :use_verified_content true}
                 :model/Metabot    {m2 :id} {:name "Metabot 2" :collection_id collection-id}
                 :model/Metabot    {m3 :id} {:name "Metabot 3" :use_verified_content true}
                 :model/Metabot    {m4 :id} {:name "Metabot 4" :collection_id collection-id}
                 :model/Metabot    {m5 :id} {:name "Metabot 5" :use_verified_content true}
                 :model/Metabot    {m6 :id} {:name "Metabot 6" :collection_id collection-id}
                 :model/Metabot    {m7 :id} {:name "Metabot 7" :use_verified_content true}
                 :model/Metabot    {m8 :id} {:name "Metabot 8" :collection_id collection-id}
                 :model/Metabot    {m9 :id} {:name "Metabot 9"}]
    (let [counted (fn [ids]
                    (events.tu/statement-count!
                     #(metabot/update-metabots! (mapv (fn [row-id] (assoc {:use_verified_content true :collection_id collection-id} :id row-id)) ids))))]
      (counted [m9])
      (is (= (counted [m1 m2]) (counted [m3 m4 m5 m6 m7 m8])))
      (testing "every Metabot ends with the changes"
        (is (= #{[true collection-id]}
               (set (map (juxt :use_verified_content :collection_id)
                         (t2/select :model/Metabot :id [:in [m1 m2 m3 m4 m5 m6 m7 m8]])))))))))
