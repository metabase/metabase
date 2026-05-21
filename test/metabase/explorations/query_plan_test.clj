(ns metabase.explorations.query-plan-test
  "Tests for the orchestrator's planner-selection logic. Planner-specific
  validators and variant emission live in
  `metabase.explorations.query-plan.llm-test` and
  `metabase.explorations.query-plan.mechanical-test`."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan :as query-plan]
   [metabase.explorations.query-plan.llm :as qp.llm]
   [metabase.explorations.query-plan.mechanical :as qp.mech]
   [metabase.explorations.query-plan.planner :as planner]
   [metabase.explorations.settings :as explorations.settings]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]))

(deftest pick-planner-test
  (testing ":auto + LLM configured → LLM planner"
    (mt/with-temporary-setting-values [explorations-query-planner :auto]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)]
        (is (identical? qp.llm/planner (query-plan/pick-planner!)))
        (is (= :llm (planner/planner-name (query-plan/pick-planner!)))))))

  (testing ":auto + LLM unconfigured → mechanical planner (no skip)"
    (mt/with-temporary-setting-values [explorations-query-planner :auto]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
        (is (identical? qp.mech/planner (query-plan/pick-planner!)))
        (is (= :mechanical (planner/planner-name (query-plan/pick-planner!)))))))

  (testing ":llm + LLM configured → LLM planner"
    (mt/with-temporary-setting-values [explorations-query-planner :llm]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)]
        (is (identical? qp.llm/planner (query-plan/pick-planner!))))))

  (testing ":llm + LLM unconfigured → skip-no-llm"
    (mt/with-temporary-setting-values [explorations-query-planner :llm]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
        (is (= {:skip :skip-no-llm} (query-plan/pick-planner!))))))

  (testing ":mechanical always picks mechanical, regardless of LLM availability"
    (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)]
        (is (identical? qp.mech/planner (query-plan/pick-planner!))))
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
        (is (identical? qp.mech/planner (query-plan/pick-planner!)))))))

(deftest planner-protocol-implementations-test
  (testing "Every planner singleton satisfies the QueryPlanner protocol"
    (is (satisfies? planner/QueryPlanner qp.llm/planner))
    (is (satisfies? planner/QueryPlanner qp.mech/planner)))

  (testing "Each planner names itself"
    (is (= :llm        (planner/planner-name qp.llm/planner)))
    (is (= :mechanical (planner/planner-name qp.mech/planner)))))

(deftest planner-setting-default-test
  (testing "explorations-query-planner defaults to :mechanical"
    (is (= :mechanical (explorations.settings/explorations-query-planner)))))
