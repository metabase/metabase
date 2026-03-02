(ns metabase-enterprise.metabot-v3.tools.ask-clarification-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.ask-clarification :as ask-clarification]))

(deftest ask-for-sql-clarification-test
  (testing "returns final-response? flag"
    (let [result (ask-clarification/ask-for-sql-clarification {:question "What table should I use?"})]
      (is (map? result))
      (is (true? (:final-response? result)))))

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

(deftest final-response-behavior-test
  (testing "final-response? signals agent should stop"
    ;; This is a contract test - the agent loop checks for :final-response? true
    ;; to determine if it should stop processing
    (let [result (ask-clarification/ask-for-sql-clarification {:question "Test?"})]
      (is (true? (:final-response? result))
          "ask_for_sql_clarification must return :final-response? true to stop the agent loop"))))
