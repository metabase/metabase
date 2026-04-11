(ns metabase.metabot.persistence-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.persistence :as persistence]))

(deftest normalize-data-event-types-test
  (testing "converts underscore data event types to kebab-case"
    (is (= [{:type "data-navigate-to" :data "/question#abc"}]
           (persistence/normalize-data-event-types
            [{:type "data-navigate_to" :data "/question#abc"}])))
    (is (= [{:type "data-todo-list" :data [{:id "1"}]}]
           (persistence/normalize-data-event-types
            [{:type "data-todo_list" :data [{:id "1"}]}])))
    (is (= [{:type "data-code-edit" :data {:mode "rewrite"}}]
           (persistence/normalize-data-event-types
            [{:type "data-code_edit" :data {:mode "rewrite"}}])))
    (is (= [{:type "data-transform-suggestion" :data {:id 1}}]
           (persistence/normalize-data-event-types
            [{:type "data-transform_suggestion" :data {:id 1}}])))
    (is (= [{:type "data-adhoc-viz" :data {:query {}}}]
           (persistence/normalize-data-event-types
            [{:type "data-adhoc_viz" :data {:query {}}}])))
    (is (= [{:type "data-static-viz" :data {:entity_id 42}}]
           (persistence/normalize-data-event-types
            [{:type "data-static_viz" :data {:entity_id 42}}]))))

  (testing "leaves already-kebab data types unchanged"
    (is (= [{:type "data-navigate-to" :data "/x"}]
           (persistence/normalize-data-event-types
            [{:type "data-navigate-to" :data "/x"}]))))

  (testing "leaves data-state unchanged (no underscore)"
    (is (= [{:type "data-state" :data {:queries {}}}]
           (persistence/normalize-data-event-types
            [{:type "data-state" :data {:queries {}}}]))))

  (testing "does not modify non-data types"
    (is (= [{:type "text" :text "hello"}
            {:type "tool-search" :toolCallId "tc1"}]
           (persistence/normalize-data-event-types
            [{:type "text" :text "hello"}
             {:type "tool-search" :toolCallId "tc1"}]))))

  (testing "handles mixed data and non-data entries"
    (is (= [{:type "text" :text "hi"}
            {:type "data-navigate-to" :data "/x"}
            {:type "tool-search" :toolCallId "tc1"}
            {:type "data-code-edit" :data {}}]
           (persistence/normalize-data-event-types
            [{:type "text" :text "hi"}
             {:type "data-navigate_to" :data "/x"}
             {:type "tool-search" :toolCallId "tc1"}
             {:type "data-code_edit" :data {}}])))))

(deftest migrate-v1->v2-normalizes-data-types-test
  (testing "normalizes underscore data types in passthrough blocks"
    (let [v1b-data [{:type "text" :text "hello"}
                    {:type "data-navigate_to" :data "/question#abc"}
                    {:type "data-todo_list" :data []}]]
      (is (= [{:type "text" :text "hello"}
              {:type "data-navigate-to" :data "/question#abc"}
              {:type "data-todo-list" :data []}]
             (persistence/migrate-v1b->v2 v1b-data)))))

  (testing "normalizes data types after merging tool-input/tool-output pairs"
    (let [v1b-data [{:type "tool-input" :id "tc1" :function "search" :arguments {:q "test"}}
                    {:type "tool-output" :id "tc1" :result {:output "found"}}
                    {:type "data-transform_suggestion" :data {:id 1}}]]
      (is (= "data-transform-suggestion"
             (-> (persistence/migrate-v1->v2 v1b-data)
                 last
                 :type))))))

(deftest migrate-v1a->v2-test
  (testing "TEXT entry becomes text part"
    (is (= [{:type "text" :text "hello"}]
           (persistence/migrate-v1a->v2
            [{:role "assistant" :_type "TEXT" :content "hello"}]))))

  (testing "ERROR entry becomes AI-SDK-shaped error part"
    (is (= [{:type "error" :errorText "boom"}]
           (persistence/migrate-v1a->v2
            [{:role "assistant" :_type "ERROR" :content "boom"}]))))

  (testing "multiline ERROR content is preserved verbatim"
    (is (= [{:type "error" :errorText "upstream provider error\nrequest id: abc-123"}]
           (persistence/migrate-v1a->v2
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
           (persistence/migrate-v1a->v2
            [{:role "assistant" :_type "TOOL_CALL"
              :tool_calls [{:id "tc1" :name "search" :arguments "{\"q\":\"test\"}"}]}
             {:role "tool" :_type "TOOL_RESULT" :tool_call_id "tc1" :content "result"}]))))

  (testing "TOOL_CALL without matching result stays input-available"
    (let [[part] (persistence/migrate-v1a->v2
                  [{:_type "TOOL_CALL"
                    :tool_calls [{:id "tc1" :name "search" :arguments "{}"}]}])]
      (is (= "input-available" (:state part)))
      (is (not (contains? part :output)))))

  (testing ":arguments with malformed JSON falls back to raw string"
    (let [[part] (persistence/migrate-v1a->v2
                  [{:_type "TOOL_CALL"
                    :tool_calls [{:id "tc1" :name "f" :arguments "not-json"}]}])]
      (is (= "not-json" (:input part)))))

  (testing "batched TOOL_CALL entries split into separate v2 parts, preserving position"
    (let [parts (persistence/migrate-v1a->v2
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
           (persistence/migrate-v1a->v2
            [{:_type "DATA" :type "navigate_to" :version 1 :value "/metric/17991"}]))))

  (testing "each real-world DATA subtype from the CSV"
    (is (= [{:type "data-navigate-to"        :data "/x"}
            {:type "data-code-edit"          :data {}}
            {:type "data-transform-suggestion" :data {:id 1}}
            {:type "data-adhoc-viz"          :data {:query {}}}
            {:type "data-todo-list"          :data []}
            {:type "data-static-viz"         :data {:entity_id 42}}]
           (persistence/migrate-v1a->v2
            [{:_type "DATA" :type "navigate_to"         :version 1 :value "/x"}
             {:_type "DATA" :type "code_edit"           :version 1 :value {}}
             {:_type "DATA" :type "transform_suggestion" :version 1 :value {:id 1}}
             {:_type "DATA" :type "adhoc_viz"           :version 1 :value {:query {}}}
             {:_type "DATA" :type "todo_list"           :version 1 :value []}
             {:_type "DATA" :type "static_viz"          :version 1 :value {:entity_id 42}}]))))

  (testing "orphan TOOL_RESULT is dropped silently"
    (is (= []
           (persistence/migrate-v1a->v2
            [{:_type "TOOL_RESULT" :tool_call_id "nope" :content "x"}])))))

(deftest migrate-v1->v2-dispatch-test
  (testing "dispatches to migrate-v1a->v2 for v1a shape and produces clean v2"
    (let [v1a-data [{:role "assistant" :_type "TEXT" :content "hi"}
                    {:role "assistant" :_type "TOOL_CALL"
                     :tool_calls [{:id "tc1" :name "search" :arguments "{}"}]}
                    {:role "tool"      :_type "TOOL_RESULT" :tool_call_id "tc1" :content "r"}
                    {:_type "DATA" :type "navigate_to" :version 1 :value "/q/1"}]
          result   (persistence/migrate-v1->v2 v1a-data)]
      (is (= ["text" "tool-search" "data-navigate-to"] (mapv :type result)))
      (testing "no :_type survives anywhere in the migrated output"
        (is (every? #(not (contains? % :_type)) result)))))

  (testing "user-message rows (v1 by data_version, v2 by shape) pass through unchanged"
    (is (= [{:role "user" :content "Do we have data on orders"}]
           (persistence/migrate-v1->v2
            [{:role "user" :content "Do we have data on orders"}]))))

  (testing "dispatcher still throws on truly unrecognized shapes"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unrecognized v1 storage format"
                          (persistence/migrate-v1->v2
                           [{:role "assistant" :some-unknown-key "x"}])))))

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
