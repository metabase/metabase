(ns metabase.metabot.persistence-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.persistence :as persistence]))

(deftest migrate-v1-normalizes-tool-type-underscores-test
  (testing "v1-native tool with underscored name becomes kebab-case after migration"
    (let [v1-native-data [{:type "tool-input" :id "tc1" :function "create_sql_query" :arguments {:q "test"}}
                          {:type "tool-output" :id "tc1" :result {:sql "SELECT 1"}}]]
      (is (= "tool-create-sql-query"
             (-> (persistence/migrate-v1-native->v2 v1-native-data) first :type)))))

  (testing "v1-external-ai-service tool with underscored name becomes kebab-case after migration"
    (let [v1-data [{:_type "TOOL_CALL"
                    :tool_calls [{:id "tc1" :name "create_sql_query" :arguments "{}"}]}
                   {:_type "TOOL_RESULT" :tool_call_id "tc1" :content "result"}]]
      (is (= "tool-create-sql-query"
             (-> (persistence/migrate-v1-external-ai-service->v2 v1-data) first :type))))))

(deftest migrate-v1-native->v2-tool-error-test
  (let [input [{:type "tool-input" :id "tc1" :function "search" :arguments {:q "x"}}]]
    (testing "error state: carries :error, omits :output"
      (let [part (-> (persistence/migrate-v1-native->v2
                      (conj input {:type "tool-output" :id "tc1" :error "boom"}))
                     first)]
        (is (= "error" (:state part)))
        (is (= "boom" (:error part)))
        (is (not (contains? part :output)))))

    (testing "error state: preserves map-shaped :error"
      (is (= {:message "bad"} (-> (persistence/migrate-v1-native->v2
                                   (conj input {:type "tool-output" :id "tc1" :error {:message "bad"}}))
                                  first :error))))

    (testing "input-available when no matching tool-output exists"
      (let [part (first (persistence/migrate-v1-native->v2 input))]
        (is (= "input-available" (:state part)))
        (is (not (contains? part :output)))
        (is (not (contains? part :error)))))))

(deftest migrate-v1-external-ai-service->v2-test
  (testing "TEXT entry becomes text part"
    (is (= [{:type "text" :text "hello"}]
           (persistence/migrate-v1-external-ai-service->v2
            [{:role "assistant" :_type "TEXT" :content "hello"}]))))

  (testing "ERROR entry becomes AI-SDK-shaped error part"
    (is (= [{:type "error" :errorText "boom"}]
           (persistence/migrate-v1-external-ai-service->v2
            [{:role "assistant" :_type "ERROR" :content "boom"}]))))

  (testing "multiline ERROR content is preserved verbatim"
    (is (= [{:type "error" :errorText "upstream provider error\nrequest id: abc-123"}]
           (persistence/migrate-v1-external-ai-service->v2
            [{:role   "assistant"
              :_type  "ERROR"
              :content "upstream provider error\nrequest id: abc-123"}]))))

  (testing "TOOL_CALL with matching TOOL_RESULT merges into output-available tool part"
    (is (= [{:type       "tool-search"
             :toolCallId "tc1"
             :toolName   "search"
             :state      "output-available"
             :input      {:q "test"}
             :output     "result"}]
           (persistence/migrate-v1-external-ai-service->v2
            [{:role "assistant" :_type "TOOL_CALL"
              :tool_calls [{:id "tc1" :name "search" :arguments "{\"q\":\"test\"}"}]}
             {:role "tool" :_type "TOOL_RESULT" :tool_call_id "tc1" :content "result"}]))))

  (testing "TOOL_CALL without matching result stays input-available"
    (let [[part] (persistence/migrate-v1-external-ai-service->v2
                  [{:_type "TOOL_CALL"
                    :tool_calls [{:id "tc1" :name "search" :arguments "{}"}]}])]
      (is (= "input-available" (:state part)))
      (is (not (contains? part :output)))))

  (testing ":arguments with malformed JSON falls back to raw string"
    (let [[part] (persistence/migrate-v1-external-ai-service->v2
                  [{:_type "TOOL_CALL"
                    :tool_calls [{:id "tc1" :name "f" :arguments "not-json"}]}])]
      (is (= "not-json" (:input part)))))

  (testing "batched TOOL_CALL entries split into separate v2 parts, preserving position"
    (let [parts (persistence/migrate-v1-external-ai-service->v2
                 [{:_type "TEXT" :content "before"}
                  {:_type "TOOL_CALL"
                   :tool_calls [{:id "a" :name "search" :arguments "{}"}
                                {:id "b" :name "browse" :arguments "{}"}]}
                  {:_type "TOOL_RESULT" :tool_call_id "a" :content "r1"}
                  {:_type "TOOL_RESULT" :tool_call_id "b" :content "r2"}
                  {:_type "TEXT" :content "after"}])]
      (is (= ["text" "tool-search" "tool-browse" "text"] (mapv :type parts)))
      (is (= "r1" (:output (nth parts 1))))
      (is (= "r2" (:output (nth parts 2))))))

  (testing "DATA entry with real underscore subtype (navigate_to) → kebab-cased v2"
    (is (= [{:type "data-navigate-to" :data "/metric/17991"}]
           (persistence/migrate-v1-external-ai-service->v2
            [{:_type "DATA" :type "navigate_to" :version 1 :value "/metric/17991"}]))))

  (testing "each real-world DATA subtype from the CSV"
    (is (= [{:type "data-navigate-to"        :data "/x"}
            {:type "data-code-edit"          :data {}}
            {:type "data-transform-suggestion" :data {:id 1}}
            {:type "data-adhoc-viz"          :data {:query {}}}
            {:type "data-todo-list"          :data []}
            {:type "data-static-viz"         :data {:entity_id 42}}]
           (persistence/migrate-v1-external-ai-service->v2
            [{:_type "DATA" :type "navigate_to"         :version 1 :value "/x"}
             {:_type "DATA" :type "code_edit"           :version 1 :value {}}
             {:_type "DATA" :type "transform_suggestion" :version 1 :value {:id 1}}
             {:_type "DATA" :type "adhoc_viz"           :version 1 :value {:query {}}}
             {:_type "DATA" :type "todo_list"           :version 1 :value []}
             {:_type "DATA" :type "static_viz"          :version 1 :value {:entity_id 42}}]))))

  (testing "orphan TOOL_RESULT is dropped silently"
    (is (= []
           (persistence/migrate-v1-external-ai-service->v2
            [{:_type "TOOL_RESULT" :tool_call_id "nope" :content "x"}])))))

(deftest migrate-v1->v2-dispatch-test
  (testing "dispatches to migrate-v1-external-ai-service->v2 for v1-external-ai-service shape and produces clean v2"
    (let [v1-external-ai-service-data [{:role "assistant" :_type "TEXT" :content "hi"}
                                       {:role "assistant" :_type "TOOL_CALL"
                                        :tool_calls [{:id "tc1" :name "search" :arguments "{}"}]}
                                       {:role "tool"      :_type "TOOL_RESULT" :tool_call_id "tc1" :content "r"}
                                       {:_type "DATA" :type "navigate_to" :version 1 :value "/q/1"}]
          result   (persistence/migrate-v1->v2 v1-external-ai-service-data)]
      (is (= ["text" "tool-search" "data-navigate-to"] (mapv :type result)))))

  (testing "throws on unrecognized v1-external-ai-service entry types"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unrecognized v1-external-ai-service entry type"
                          (persistence/migrate-v1-external-ai-service->v2
                           [{:_type "FINISH_MESSAGE" :role "assistant" :usage {}}]))))

  (testing "user-message rows (v1 by data_version, v2 by shape) pass through unchanged"
    (is (= [{:role "user" :content "Do we have data on orders"}]
           (persistence/migrate-v1->v2
            [{:role "user" :content "Do we have data on orders"}]))))

  (testing "empty data throws as unrecognized"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unrecognized v1 storage format"
                          (persistence/migrate-v1->v2 []))))

  (testing "dispatcher still throws on truly unrecognized shapes"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unrecognized v1 storage format"
                          (persistence/migrate-v1->v2
                           [{:role "assistant" :some-unknown-key "x"}])))))

(deftest total-tokens-test
  (testing "nil usage returns 0"
    (is (zero? (#'persistence/total-tokens nil))))
  (testing "empty map returns 0"
    (is (zero? (#'persistence/total-tokens {}))))
  (testing "single model sums prompt + completion"
    (is (= 150 (#'persistence/total-tokens {"gpt-4" {:prompt 100 :completion 50}}))))
  (testing "multiple models are summed"
    (is (= 300 (#'persistence/total-tokens {"gpt-4"   {:prompt 100 :completion 50}
                                            "claude"  {:prompt 80  :completion 70}}))))
  (testing "non-map values in usage are skipped"
    (is (= 150 (#'persistence/total-tokens {"gpt-4"  {:prompt 100 :completion 50}
                                            "legacy" 200}))))
  (testing "missing :prompt or :completion defaults to 0"
    (is (= 50 (#'persistence/total-tokens {"m" {:completion 50}})))))

(deftest internal-parts->storable-produces-kebab-case-test
  (testing "data parts get kebab-case type names"
    (let [parts [{:type :data :data-type "navigate-to" :data "/x"}
                 {:type :data :data-type "todo-list" :data []}
                 {:type :data :data-type "code-edit" :data {}}
                 {:type :data :data-type "transform-suggestion" :data {:id 1}}
                 {:type :data :data-type "adhoc-viz" :data {:query {}}}
                 {:type :data :data-type "static-viz" :data {:entity_id 42}}]
          result (persistence/internal-parts->storable parts)]
      (is (= ["data-navigate-to"
              "data-todo-list"
              "data-code-edit"
              "data-transform-suggestion"
              "data-adhoc-viz"
              "data-static-viz"]
             (mapv :type result))))))

(deftest internal-parts->storable-data-parts-full-shape-test
  (testing "data part with :data-type produces correct type and preserves :data payload"
    (is (= [{:type "data-navigate-to" :data "/metric/42"}]
           (persistence/internal-parts->storable
            [{:type :data :data-type "navigate-to" :data "/metric/42"}]))))

  (testing "data part with nil :data-type falls back to \"data-data\""
    (is (= [{:type "data-data" :data {:some "payload"}}]
           (persistence/internal-parts->storable
            [{:type :data :data-type nil :data {:some "payload"}}]))))

  (testing "data part with missing :data-type key falls back to \"data-data\""
    (is (= [{:type "data-data" :data [1 2 3]}]
           (persistence/internal-parts->storable
            [{:type :data :data [1 2 3]}]))))

  (testing "data part with nil :data preserves nil in output"
    (is (= [{:type "data-todo-list" :data nil}]
           (persistence/internal-parts->storable
            [{:type :data :data-type "todo-list" :data nil}])))))

(deftest internal-parts->storable-error-part-test
  (testing "error part (as produced by agent/core error-part) hits default branch"
    ;; mimics the shape from agent/core.clj error-part
    (is (= [{:type "error"}]
           (persistence/internal-parts->storable
            [{:type :error
              :error {:message "Something went wrong"
                      :type "java.lang.RuntimeException"
                      :data nil}}]))))

  (testing "error part :error field is not preserved by default branch"
    (is (not (contains? (first (persistence/internal-parts->storable
                                [{:type :error
                                  :error {:message "API timeout"
                                          :type "clojure.lang.ExceptionInfo"
                                          :data {:api-error true}}}]))
                        :error))))

  (testing "error part with additional :text field preserves the text"
    (let [result (persistence/internal-parts->storable
                  [{:type :error
                    :error {:message "boom"}
                    :text "An error occurred"}])]
      (is (= [{:type "error" :text "An error occurred"}]
             result))
      (is (not (contains? (first result) :error))))))
