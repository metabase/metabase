(ns metabase.metabot.persistence-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.persistence :as persistence]))

(deftest migrate-v1-preserves-tool-name-underscores-test
  (testing "v1-native tool name is preserved verbatim (underscores intact) in :type and :toolName"
    (let [v1-native-data [{:type "tool-input" :id "tc1" :function "create_sql_query" :arguments {:q "test"}}
                          {:type "tool-output" :id "tc1" :result {:output "SELECT 1"}}]
          part (-> (persistence/migrate-v1-native->v2 v1-native-data) first)]
      (is (= "tool-create_sql_query" (:type part)))
      (is (= "create_sql_query" (:toolName part)))))

  (testing "v1-external-ai-service tool name is preserved verbatim (underscores intact) in :type and :toolName"
    (let [v1-data [{:_type "TOOL_CALL"
                    :tool_calls [{:id "tc1" :name "create_sql_query" :arguments "{}"}]}
                   {:_type "TOOL_RESULT" :tool_call_id "tc1" :content "result"}]
          part (-> (persistence/migrate-v1-external-ai-service->v2 v1-data) first)]
      (is (= "tool-create_sql_query" (:type part)))
      (is (= "create_sql_query" (:toolName part))))))

(deftest migrate-v1-native->v2-tool-output-test
  (let [input [{:type "tool-input" :id "tc1" :function "search" :arguments {:q "x"}}]]
    (testing "success: :output is the inner text string, not the wrapping :result map"
      (is (= [{:type       "tool-search"
               :toolCallId "tc1"
               :toolName   "search"
               :state      "output-available"
               :input      {:q "x"}
               :output     "result text"}]
             (persistence/migrate-v1-native->v2
              (conj input
                    {:type "tool-output" :id "tc1" :result {:output "result text"}})))))

    (testing "standalone error entries are filtered out as non-storable"
      (is (= [{:type       "tool-search"
               :toolCallId "tc1"
               :toolName   "search"
               :state      "output-available"
               :input      {:q "x"}
               :output     "result text"}]
             (persistence/migrate-v1-native->v2
              (conj input
                    {:type "tool-output" :id "tc1" :result {:output "result text"}}
                    {:type "error" :error {:message "Something went wrong"}})))))))

(deftest migrate-v1-native->v2-tool-error-test
  (let [input [{:type "tool-input" :id "tc1" :function "search" :arguments {:q "x"}}]]
    (testing "error state: carries :errorText, omits :output (master stored :result {} on errors)"
      (let [part (-> (persistence/migrate-v1-native->v2
                      (conj input {:type "tool-output" :id "tc1" :result {} :error "boom"}))
                     first)]
        (is (= "output-error" (:state part)))
        (is (= "boom" (:errorText part)))
        (is (not (contains? part :output)))))

    (testing "error state omits :output even when only :error is set (no :result)"
      (let [part (-> (persistence/migrate-v1-native->v2
                      (conj input {:type "tool-output" :id "tc1" :error "boom"}))
                     first)]
        (is (= "output-error" (:state part)))
        (is (= "boom" (:errorText part)))
        (is (not (contains? part :output)))))

    (testing "error state: extracts :message from map-shaped :error"
      (is (= "bad" (-> (persistence/migrate-v1-native->v2
                        (conj input {:type "tool-output" :id "tc1" :result {} :error {:message "bad"}}))
                       first :errorText))))

    (testing "input-available when no matching tool-output exists"
      (let [part (first (persistence/migrate-v1-native->v2 input))]
        (is (= "input-available" (:state part)))
        (is (not (contains? part :output)))
        (is (not (contains? part :errorText)))))))

(deftest migrate-v1-external-ai-service->v2-test
  (testing "TEXT entry becomes text part"
    (is (= [{:type "text" :text "hello"}]
           (persistence/migrate-v1-external-ai-service->v2
            [{:role "assistant" :_type "TEXT" :content "hello"}]))))

  (testing "ERROR entries are silently dropped"
    (is (= [] (persistence/migrate-v1-external-ai-service->v2
               [{:role "assistant" :_type "ERROR" :content "boom"}]))))

  (testing "ERROR mixed with content entries is dropped"
    (is (= [{:type "text" :text "hello"}]
           (persistence/migrate-v1-external-ai-service->v2
            [{:_type "TEXT" :content "hello"}
             {:role "assistant" :_type "ERROR" :content "upstream provider error"}]))))

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

  (testing "DATA entry with underscore subtype (navigate_to) is preserved verbatim in v2"
    (is (= [{:type "data-navigate_to" :data "/metric/17991"}]
           (persistence/migrate-v1-external-ai-service->v2
            [{:_type "DATA" :type "navigate_to" :version 1 :value "/metric/17991"}]))))

  (testing "each real-world DATA subtype from the CSV"
    (is (= [{:type "data-navigate_to"         :data "/x"}
            {:type "data-code_edit"           :data {}}
            {:type "data-transform_suggestion" :data {:id 1}}
            {:type "data-adhoc_viz"           :data {:query {}}}
            {:type "data-todo_list"           :data []}
            {:type "data-static_viz"          :data {:entity_id 42}}]
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
      (is (= ["text" "tool-search" "data-navigate_to"] (mapv :type result)))))

  (testing "FINISH_MESSAGE entries are silently dropped"
    (is (= [] (persistence/migrate-v1-external-ai-service->v2
               [{:_type "FINISH_MESSAGE" :role "assistant" :usage {}}]))))

  (testing "FINISH_MESSAGE mixed with content entries is dropped"
    (is (= [{:type "text" :text "hi"}]
           (persistence/migrate-v1-external-ai-service->v2
            [{:_type "TEXT" :content "hi"}
             {:_type "FINISH_MESSAGE" :role "assistant" :usage {}}]))))

  (testing "user-message rows are converted to v2 text format"
    (is (= [{:type "text" :text "Do we have data on orders"}]
           (persistence/migrate-v1->v2
            [{:role "user" :content "Do we have data on orders"}]))))

  (testing "empty data passes through unchanged"
    (is (= [] (persistence/migrate-v1->v2 []))))

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

(deftest internal-parts->storable-data-type-prefixing-test
  (testing "data parts get \"data-\" prefix applied to :data-type verbatim"
    (let [parts [{:type :data :data-type "navigate_to" :data "/x"}
                 {:type :data :data-type "todo_list" :data []}
                 {:type :data :data-type "code_edit" :data {}}
                 {:type :data :data-type "transform_suggestion" :data {:id 1}}
                 {:type :data :data-type "adhoc_viz" :data {:query {}}}
                 {:type :data :data-type "static_viz" :data {:entity_id 42}}]
          result (persistence/internal-parts->storable parts)]
      (is (= ["data-navigate_to"
              "data-todo_list"
              "data-code_edit"
              "data-transform_suggestion"
              "data-adhoc_viz"
              "data-static_viz"]
             (mapv :type result))))))

(deftest internal-parts->storable-data-parts-full-shape-test
  (testing "data part with :data-type produces correct type and preserves :data payload"
    (is (= [{:type "data-navigate_to" :data "/metric/42"}]
           (persistence/internal-parts->storable
            [{:type :data :data-type "navigate_to" :data "/metric/42"}]))))

  (testing "data part with nil :data-type falls back to \"data-data\""
    (is (= [{:type "data-data" :data {:some "payload"}}]
           (persistence/internal-parts->storable
            [{:type :data :data-type nil :data {:some "payload"}}]))))

  (testing "data part with missing :data-type key falls back to \"data-data\""
    (is (= [{:type "data-data" :data [1 2 3]}]
           (persistence/internal-parts->storable
            [{:type :data :data [1 2 3]}]))))

  (testing "data part with nil :data preserves nil in output"
    (is (= [{:type "data-todo_list" :data nil}]
           (persistence/internal-parts->storable
            [{:type :data :data-type "todo_list" :data nil}])))))

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
