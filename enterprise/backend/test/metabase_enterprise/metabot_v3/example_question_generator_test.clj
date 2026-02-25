(ns metabase-enterprise.metabot-v3.example-question-generator-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.llm.settings :as llm]
   [metabase-enterprise.metabot-v3.example-question-generator :as native-generator]
   [metabase-enterprise.metabot-v3.self.openrouter :as openrouter]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest llm-name-test
  (testing "plain column"
    (is (= "price" (#'native-generator/llm-name {:name "price"}))))
  (testing "FK column with table-reference"
    (is (= "products__name" (#'native-generator/llm-name {:name "name" :table-reference "products"}))))
  (testing "nil table-reference"
    (is (= "id" (#'native-generator/llm-name {:name "id" :table-reference nil})))))

(deftest llm-description-test
  (testing "plain column with description"
    (is (= "The price" (#'native-generator/llm-description {:description "The price"}))))
  (testing "FK column with description"
    (is (= "From the related products table. Product name"
           (#'native-generator/llm-description {:description "Product name" :table-reference "products"}))))
  (testing "FK column without description"
    (is (= "From the related products table."
           (#'native-generator/llm-description {:table-reference "products"}))))
  (testing "no description no table-reference"
    (is (= "" (#'native-generator/llm-description {})))))

(deftest enrich-column-test
  (testing "adds llm_name and llm_description while preserving original keys"
    (is (=? {:llm_name        "region"
             :llm_description "Sales region"
             :name            "region"
             :type            "string"
             :description     "Sales region"}
            (#'native-generator/enrich-column {:name "region" :type "string" :description "Sales region"})))))

(deftest validate-questions-response-test
  (testing "valid response passes"
    (is (nil? (#'native-generator/validate-questions-response!
               {:questions ["q1" "q2"]} "test"))))
  (testing "nil response throws"
    (is (thrown-with-msg? Exception #"Invalid LLM response shape"
                          (#'native-generator/validate-questions-response! nil "test"))))
  (testing "missing questions key throws"
    (is (thrown-with-msg? Exception #"Invalid LLM response shape"
                          (#'native-generator/validate-questions-response! {:foo "bar"} "test"))))
  (testing "non-string items throws"
    (is (thrown-with-msg? Exception #"Invalid LLM response shape"
                          (#'native-generator/validate-questions-response!
                           {:questions [1 2 3]} "test"))))
  (testing "empty questions list passes"
    (is (nil? (#'native-generator/validate-questions-response!
               {:questions []} "test")))))

(deftest generate-example-questions-shape-test
  (testing "returns correct shape with mock LLM"
    (let [mock-response {:questions ["q1" "q2" "q3" "q4" "q5"]}]
      (with-redefs [native-generator/call-llm (constantly mock-response)]
        (let [payload {:tables  [{:name "Orders"
                                  :description "Customer orders"
                                  :fields [{:name "total" :type "number"}
                                           {:name "created_at" :type "date"}]}]
                       :metrics [{:name "Revenue"
                                  :description "Total revenue"
                                  :queryable-dimensions [{:name "region" :type "string"}]
                                  :default-time-dimension {:name "created_at" :type "date"}}]}]
          (is (=? {:table_questions  [{:questions ["q1" "q2" "q3" "q4" "q5"]}]
                   :metric_questions [{:questions ["q1" "q2" "q3" "q4" "q5"]}]}
                  (native-generator/generate-example-questions payload))))))))

(deftest generate-example-questions-empty-payload-test
  (testing "handles empty tables and metrics"
    (with-redefs [native-generator/call-llm (fn [_] (throw (ex-info "should not be called" {})))]
      (is (=? {:table_questions  []
               :metric_questions []}
              (native-generator/generate-example-questions {:tables [] :metrics []}))))))

(deftest generate-example-questions-parallel-test
  (testing "processes multiple items"
    (let [call-count (atom 0)]
      (with-redefs [native-generator/call-llm
                    (fn [_]
                      (swap! call-count inc)
                      {:questions [(str "q" @call-count)]})]
        (let [payload {:tables  [{:name "T1" :fields [{:name "a" :type "number"}]}
                                 {:name "T2" :fields [{:name "b" :type "string"}]}]
                       :metrics [{:name "M1"
                                  :queryable-dimensions [{:name "x" :type "date"}]}]}
              result (native-generator/generate-example-questions payload)]
          ;; 2 tables + 1 metric = 3 LLM calls
          (is (= 3 @call-count))
          (is (=? {:table_questions  [{:questions vector?} {:questions vector?}]
                   :metric_questions [{:questions vector?}]}
                  result)))))))

(deftest generate-example-questions-validation-failure-throws-test
  (testing "invalid LLM response propagates as exception"
    (with-redefs [native-generator/call-llm (constantly {:bad "response"})]
      (is (thrown-with-msg?
           Exception #"Invalid LLM response shape"
           (native-generator/generate-example-questions
            {:tables [{:name "T1" :fields [{:name "a" :type "number"}]}]
             :metrics []}))))))

(deftest generate-example-questions-routes-through-openrouter-test
  (testing "generate-example-questions routes LLM calls through openrouter when provider is openrouter/*"
    ;; Mocks openrouter/openrouter rather than native-generator/call-llm to exercise the path through
    ;; self/call-llm-structured and parse-provider-model.
    (let [captured-opts (atom [])]
      (mt/with-temporary-setting-values [llm/ee-ai-metabot-provider "openrouter/anthropic/claude-haiku-4-5"]
        (with-redefs [openrouter/openrouter (fn [opts]
                                              (swap! captured-opts conj opts)
                                              [{:type :start :messageId "msg-1"}
                                               {:type :tool-input-start :toolCallId "call-1" :toolName "json"}
                                               {:type :tool-input-delta :toolCallId "call-1"
                                                :inputTextDelta "{\"questions\":[\"q1\",\"q2\"]}"}])]
          (testing "returns questions from openrouter responses"
            (is (=? {:table_questions  [{:questions ["q1" "q2"]}]
                     :metric_questions [{:questions ["q1" "q2"]}]}
                    (native-generator/generate-example-questions
                     {:tables  [{:name "Orders"
                                 :description "Customer orders"
                                 :fields [{:name "total" :type "number"}]}]
                      :metrics [{:name "Revenue"
                                 :description "Total revenue"
                                 :queryable-dimensions [{:name "region" :type "string"}]}]}))))
          (testing "makes one openrouter call per table and metric"
            (is (= 2 (count @captured-opts))))
          (testing "passes the model name derived from ee-ai-metabot-provider for every call"
            (is (=? [{:model "anthropic/claude-haiku-4-5"}
                     {:model "anthropic/claude-haiku-4-5"}]
                    @captured-opts))))))))

(deftest template-cache-test
  (testing "template is cached after first load"
    (native-generator/clear-template-cache!)
    (let [template1 (#'native-generator/load-template "metabot/prompts/example_questions_table.selmer")
          template2 (#'native-generator/load-template "metabot/prompts/example_questions_table.selmer")]
      (is (string? template1))
      (is (identical? template1 template2)))))
