(ns metabase-enterprise.metabot-v3.task.suggested-prompts-generator-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.task.suggested-prompts-generator
    :as metabot-v3.task.suggested-prompts-generator]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest suggested-prompts-generator-test
  (mt/with-premium-features #{:metabot-v3 :content-verification}
    (mt/with-empty-h2-app-db!
      (let [original-metabot (t2/select-one :model/Metabot
                                            :entity_id (get-in metabot-v3.config/metabot-config
                                                               [metabot-v3.config/internal-metabot-id :entity-id]))
            mp (mt/metadata-provider)
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                      lib.convert/->legacy-MBQL)
            admin-id (:id (mt/fetch-user :crowberto))]
        (mt/with-model-cleanup [:model/MetabotPrompt]
          (mt/with-temp
            [:model/Card
             {card-id :id}
             {:type :model
              :dataset_query query}]
            (with-redefs [metabot-v3.client/generate-example-questions
                          (fn [input]
                            ;; Return fake prompts if we have cards, empty otherwise
                            (if (or (seq (:metrics input)) (seq (:tables input)))
                              {:table_questions [{:questions ["What is the total for this model?"
                                                              "How many items are in this model?"]}]
                               :metric_questions [{:questions ["What is the current value of this metric?"
                                                               "How has this metric changed over time?"]}]}
                              {:table_questions []
                               :metric_questions []}))]

              (testing "Non-verified card with use_verified_content=false generates prompts"
                (t2/update! :model/Metabot (:id original-metabot) {:use_verified_content false})
                (#'metabot-v3.task.suggested-prompts-generator/maybe-generate-suggested-prompts!)
                (let [prompts (t2/select :model/MetabotPrompt :card_id card-id)]
                  (is (seq prompts))))

              (testing "Non-verified card with use_verified_content=true generates no prompts"
                (t2/delete! :model/MetabotPrompt)
                (t2/update! :model/Metabot (:id original-metabot) {:use_verified_content true})
                (#'metabot-v3.task.suggested-prompts-generator/maybe-generate-suggested-prompts!)
                (let [prompts (t2/select :model/MetabotPrompt :card_id card-id)]
                  (is (empty? prompts))))

              (testing "Verified card generates prompts regardless of use_verified_content"
                (mt/with-temp
                  [:model/ModerationReview
                   _
                   {:moderator_id admin-id
                    :moderated_item_id card-id
                    :moderated_item_type "card"
                    :status "verified"
                    :most_recent true}]

                  (testing "with use_verified_content=true"
                    (t2/delete! :model/MetabotPrompt)
                    (t2/update! :model/Metabot (:id original-metabot) {:use_verified_content true})
                    (#'metabot-v3.task.suggested-prompts-generator/maybe-generate-suggested-prompts!)
                    (let [prompts (t2/select :model/MetabotPrompt :card_id card-id)]
                      (is (seq prompts))))

                  (testing "with use_verified_content=false"
                    (t2/delete! :model/MetabotPrompt)
                    (t2/update! :model/Metabot (:id original-metabot) {:use_verified_content false})
                    (#'metabot-v3.task.suggested-prompts-generator/maybe-generate-suggested-prompts!)
                    (let [prompts (t2/select :model/MetabotPrompt :card_id card-id)]
                      (is (seq prompts))))))

            ;; Reset metabot state
              (t2/update! :model/Metabot (:id original-metabot) {:use_verified_content false}))))))))
