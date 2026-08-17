(ns metabase.metabot.tools.clarification-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.clarification :as ask-clarification]))

(deftest ask-for-sql-clarification-test
  (testing "returns structured-output (the success signal that lets a profile end the turn)"
    (let [result (ask-clarification/ask-for-sql-clarification {:question "What table should I use?"})]
      (is (map? result))
      (is (some? (:structured-output result)))))
  (testing "returns question in structured output"
    (let [result (ask-clarification/ask-for-sql-clarification {:question "What columns do you need?"})]
      (is (= "What columns do you need?" (get-in result [:structured-output :question])))))
  (testing "returns options in structured output when provided"
    (let [result (ask-clarification/ask-for-sql-clarification
                  {:question "Which table?"
                   :options ["users" "orders" "products"]})]
      (is (= ["users" "orders" "products"] (get-in result [:structured-output :options])))))
  (testing "returns empty options when not provided"
    (let [result (ask-clarification/ask-for-sql-clarification {:question "What do you want?"})]
      (is (= [] (get-in result [:structured-output :options])))))
  (testing "includes instructions for LLM"
    (let [result (ask-clarification/ask-for-sql-clarification {:question "Any question?"})]
      (is (contains? result :instructions))
      (is (string? (:instructions result)))
      (is (str/includes? (:instructions result) "wait")))))

(deftest terminal-via-structured-output-test
  (testing "the tool produces :structured-output so a profile with it in :terminal-tools stops"
    ;; Contract: termination is profile-driven (see metabase.metabot.agent.profiles/:sql
    ;; :terminal-tools). The agent loop ends the turn on a *successful* terminal-tool call, and a
    ;; successful clarification is signalled by the presence of :structured-output.
    (let [result (ask-clarification/ask-for-sql-clarification {:question "Test?"})]
      (is (some? (:structured-output result))
          "ask_for_sql_clarification must return :structured-output so the agent loop can stop")
      (is (not (contains? result :final-response?))
          "the tool-level :final-response? flag has been removed in favour of :terminal-tools"))))
