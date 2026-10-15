(ns metabase.metabot.task.suggested-prompts-refresh-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.suggested-prompts :as metabot.suggested-prompts]
   [metabase.metabot.task.suggested-prompts-refresh :as metabot.suggested-prompts-refresh]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private regenerate! @#'metabot.suggested-prompts-refresh/regenerate!)

(deftest regenerate!-test
  (testing "skips generation when the managed-AI limit is reached — existing prompts are left intact"
    (mt/with-temp [:model/Metabot {metabot-id :id} {:name "mb"}
                   :model/Card {card-id :id} {:name "c" :type :model}
                   :model/MetabotPrompt {prompt-id :id} {:metabot_id metabot-id :prompt "keep"
                                                         :model :model :card_id card-id}]
      (mt/with-dynamic-fn-redefs [metabot.usage/managed-free-limit-reached? (constantly true)
                                  metabot.suggested-prompts/delete-all-metabot-prompts
                                  (fn [& _] (throw (ex-info "should not delete" {})))
                                  metabot.suggested-prompts/generate-sample-prompts
                                  (fn [& _] (throw (ex-info "should not generate" {})))]
        (regenerate! metabot-id)
        (is (= #{prompt-id} (t2/select-pks-set :model/MetabotPrompt :metabot_id metabot-id))))))
  (testing "a generation failure is swallowed and rolls back the delete, so existing prompts survive"
    (mt/with-temp [:model/Metabot {metabot-id :id} {:name "mb"}
                   :model/Card {card-id :id} {:name "c" :type :model}
                   :model/MetabotPrompt {prompt-id :id} {:metabot_id metabot-id :prompt "keep"
                                                         :model :model :card_id card-id}]
      (mt/with-dynamic-fn-redefs [metabot.usage/managed-free-limit-reached? (constantly false)
                                  metabot.suggested-prompts/generate-sample-prompts
                                  (fn [& _] (throw (ex-info "boom" {})))]
        (is (nil? (regenerate! metabot-id)))
        (is (= #{prompt-id} (t2/select-pks-set :model/MetabotPrompt :metabot_id metabot-id))))))
  (testing "happy path replaces existing prompts with freshly generated ones"
    (mt/with-temp [:model/Metabot {metabot-id :id} {:name "mb"}
                   :model/Card {card-id :id} {:name "c" :type :model}
                   :model/MetabotPrompt {old-id :id} {:metabot_id metabot-id :prompt "old"
                                                      :model :model :card_id card-id}]
      (mt/with-dynamic-fn-redefs [metabot.usage/managed-free-limit-reached? (constantly false)
                                  metabot.suggested-prompts/generate-sample-prompts
                                  (fn [mid]
                                    (t2/insert! :model/MetabotPrompt {:metabot_id mid :prompt "new"
                                                                      :model :model :card_id card-id})
                                    {:status :generated :prompt_count 1})]
        (regenerate! metabot-id)
        (let [prompts (t2/select :model/MetabotPrompt :metabot_id metabot-id)]
          (is (= 1 (count prompts)))
          (is (= "new" (:prompt (first prompts))))
          (is (not= old-id (:id (first prompts))))))))
  (testing "when regeneration produces nothing, existing prompts are preserved (not wiped to empty)"
    (doseq [status [:no-library-content :ai-produced-no-prompts]]
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "mb"}
                     :model/Card {card-id :id} {:name "c" :type :model}
                     :model/MetabotPrompt {prompt-id :id} {:metabot_id metabot-id :prompt "keep"
                                                           :model :model :card_id card-id}]
        (mt/with-dynamic-fn-redefs [metabot.usage/managed-free-limit-reached? (constantly false)
                                    metabot.suggested-prompts/generate-sample-prompts (constantly {:status status})]
          (regenerate! metabot-id)
          (is (= #{prompt-id} (t2/select-pks-set :model/MetabotPrompt :metabot_id metabot-id))
              (str "prompts preserved when generation returns " status)))))))
