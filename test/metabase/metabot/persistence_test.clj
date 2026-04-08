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

(deftest ensure-current-format-normalizes-data-types-test
  (testing "normalizes underscore data types in v2 data"
    (let [v2-data [{:type "text" :text "hello"}
                   {:type "data-navigate_to" :data "/question#abc"}
                   {:type "data-todo_list" :data []}]]
      (is (= [{:type "text" :text "hello"}
              {:type "data-navigate-to" :data "/question#abc"}
              {:type "data-todo-list" :data []}]
             (persistence/ensure-current-format v2-data)))))

  (testing "normalizes data types after v1->v2 migration"
    (let [v1-data [{:type "tool-input" :id "tc1" :function "search" :arguments {:q "test"}}
                   {:type "tool-output" :id "tc1" :result {:output "found"}}
                   {:type "data-transform_suggestion" :data {:id 1}}]]
      (is (= "data-transform-suggestion"
             (-> (persistence/ensure-current-format v1-data)
                 last
                 :type))))))

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
