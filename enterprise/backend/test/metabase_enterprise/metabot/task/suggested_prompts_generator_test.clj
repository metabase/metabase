(ns metabase-enterprise.metabot.task.suggested-prompts-generator-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.example-question-generator :as metabot.example-question-generator]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.task.suggested-prompts-generator :as metabot.task.suggested-prompts-generator]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest suggested-prompts-generator-skips-generation-when-managed-provider-is-locked-test
  (mt/with-premium-features #{:content-verification :metabase-ai-managed}
    (mt/with-empty-h2-app-db!
      (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                         "metabase/anthropic/claude-sonnet-4-6"]
        (let [original-metabot (t2/select-one :model/Metabot
                                              :entity_id (get-in metabot.config/metabot-config
                                                                 [metabot.config/internal-metabot-id :entity-id]))
              mp (mt/metadata-provider)
              query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                        lib.convert/->legacy-MBQL)]
          (mt/with-model-cleanup [:model/MetabotPrompt]
            (mt/with-temp [:model/Card
                           {card-id :id}
                           {:type :model
                            :dataset_query query}]
              (t2/update! :model/Metabot (:id original-metabot) {:use_verified_content false})
              (with-redefs [premium-features/token-status
                            (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value 1000000
                                                                                       :is-locked   true}}})
                            metabot.example-question-generator/generate-example-questions
                            (fn [& _]
                              (throw (ex-info "should not generate prompts" {})))]
                (#'metabot.task.suggested-prompts-generator/maybe-generate-suggested-prompts!)
                (is (empty? (t2/select :model/MetabotPrompt :card_id card-id)))))))))))
