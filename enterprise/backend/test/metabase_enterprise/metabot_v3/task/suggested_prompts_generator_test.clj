(ns metabase-enterprise.metabot-v3.task.suggested-prompts-generator-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.task.suggested-prompts-generator
    :as metabot-v3.task.suggested-prompts-generator]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest suggested-prompts-generator-test
  (when (and (premium-features/has-feature? :metabot-v3)
             (premium-features/has-feature? :content-verification))
    (let [original-metabot (t2/select-one :model/Metabot
                                          :entity_id (get-in metabot-v3.config/metabot-config
                                                             [metabot-v3.config/internal-metabot-id :entity-id]))
          mp (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    lib.convert/->legacy-MBQL)
          admin-id (:id (mt/fetch-user :crowberto))]
      (testing "Internal Metabot defaults to truthy use_verified_content"
        (is (true? (:use_verified_content original-metabot))))
      (mt/with-model-cleanup [:model/MetabotPrompt]
        (mt/with-temp
          [:model/Card
           {card-id :id}
           {:type :model
            :dataset_query query}]
          (testing "No prompts generated for non-verified cards"
            (#'metabot-v3.task.suggested-prompts-generator/maybe-generate-suggested-prompts!)
            (is (empty? (t2/select :model/MetabotPrompt))))
          (testing "Prompts generated with verified card"
            (mt/with-temp
              [:model/ModerationReview
               _
               {:moderator_id admin-id
                :moderated_item_id card-id
                :moderated_item_type "card"
                :status "verified"
                :most_recent true}]
              (#'metabot-v3.task.suggested-prompts-generator/maybe-generate-suggested-prompts!)
              (let [prompts (t2/select :model/MetabotPrompt)]
                (is (and (seq prompts)
                         (every? (comp #{card-id} :card_id) prompts)))))))))))
