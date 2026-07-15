(ns metabase.explorations.settings-test
  "Tests that every explorations LLM task draws its model from the single
  `llm-metabot-provider` setting (UXW-4489) rather than a hardcoded choice."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.ai-summary.phase1 :as phase1]
   [metabase.explorations.ai-summary.phase2 :as phase2]
   [metabase.explorations.query-plan.llm :as qp.llm]
   [metabase.metabot.settings :as metabot.settings]))

(deftest all-llm-tasks-use-the-configured-model-test
  (testing "every explorations LLM task resolves its model from the shared setting"
    (with-redefs [metabot.settings/llm-metabot-provider (constantly "anthropic/claude-test-9")]
      (is (= "anthropic/claude-test-9" (:model (phase1/llm-config)))
          "chart curation (phase 1)")
      (is (= "anthropic/claude-test-9" (:model (phase2/llm-config)))
          "AI summary (phase 2)")
      (is (= "anthropic/claude-test-9" (:model (qp.llm/llm-config)))
          "query planner (POC)"))))

(deftest model-resolves-at-call-time-test
  (testing "configs read the setting on each call, not at namespace load"
    (with-redefs [metabot.settings/llm-metabot-provider (constantly "anthropic/first")]
      (is (= "anthropic/first" (:model (phase1/llm-config)))))
    (with-redefs [metabot.settings/llm-metabot-provider (constantly "anthropic/second")]
      (is (= "anthropic/second" (:model (phase1/llm-config)))))))
