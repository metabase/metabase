(ns metabase-enterprise.metabot.api.metabot-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.suggested-prompts :as metabot.suggested-prompts]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest metabot-put-skips-prompt-regeneration-when-managed-provider-is-locked-test
  (mt/dataset test-data
    (let [model-query {:type :query, :database (mt/id), :query {:source-table (mt/id :products)}}]
      (mt/with-premium-features #{:metabase-ai-managed}
        (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                           "metabase/anthropic/claude-sonnet-4-6"]
          (mt/with-temp [:model/Collection {collection-id :id} {:name "Collection"}
                         :model/Metabot {metabot-id :id} {:name "Test Metabot"
                                                          :collection_id collection-id}
                         :model/Card {card-id :id} {:name "Test Model Card"
                                                    :type :model
                                                    :dataset_query model-query}
                         :model/MetabotPrompt {prompt-id :id} {:metabot_id metabot-id
                                                               :prompt "existing prompt"
                                                               :model :model
                                                               :card_id card-id}]
            (with-redefs [premium-features/token-status
                          (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value 1000000
                                                                                     :is-locked   true}}})
                          metabot.suggested-prompts/delete-all-metabot-prompts
                          (fn [& _]
                            (throw (ex-info "should not delete prompts" {})))
                          metabot.suggested-prompts/generate-sample-prompts
                          (fn [& _]
                            (throw (ex-info "should not generate prompts" {})))]
              (let [response (mt/user-http-request :crowberto :put 200
                                                   (format "metabot/metabot/%d" metabot-id)
                                                   {:collection_id nil})]
                (is (nil? (:collection_id response)))
                (is (= #{prompt-id}
                       (t2/select-pks-set :model/MetabotPrompt :metabot_id metabot-id)))))))))))

(deftest metabot-prompt-regenerate-returns-free-trial-limit-error-when-managed-provider-is-locked-test
  (mt/dataset test-data
    (let [model-query {:type :query, :database (mt/id), :query {:source-table (mt/id :products)}}]
      (mt/with-premium-features #{:metabase-ai-managed}
        (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                           "metabase/anthropic/claude-sonnet-4-6"]
          (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                         :model/Card {card-id :id} {:name "Test Model Card"
                                                    :type :model
                                                    :dataset_query model-query}
                         :model/MetabotPrompt {prompt-id :id} {:metabot_id metabot-id
                                                               :prompt "existing prompt"
                                                               :model :model
                                                               :card_id card-id}]
            (with-redefs [premium-features/token-status
                          (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value 1000000
                                                                                     :is-locked   true}}})
                          metabot.suggested-prompts/delete-all-metabot-prompts
                          (fn [& _]
                            (throw (ex-info "should not delete prompts" {})))
                          metabot.suggested-prompts/generate-sample-prompts
                          (fn [& _]
                            (throw (ex-info "should not generate prompts" {})))]
              (let [response (mt/user-http-request :crowberto :post 402
                                                   (format "metabot/metabot/%d/prompt-suggestions/regenerate" metabot-id))]
                (is (= "You've used all of your included AI service tokens. To keep using AI features, end your trial early and start your subscription, or add your own AI provider API key."
                       (:message response))))
              (is (= #{prompt-id}
                     (t2/select-pks-set :model/MetabotPrompt :metabot_id metabot-id))))))))))
