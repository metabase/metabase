(ns metabase.metabot.agent.streaming-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.agent.streaming :as streaming]))

(deftest viz-part-test
  (testing "always emits a card generated_entity"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          part  (streaming/viz-part {:entity-id "card-1"
                                     :query-id  "q1"
                                     :query     query
                                     :display   :bar
                                     :title     "My Chart"})]
      (is (= :data (:type part)))
      (is (= "generated_entity" (:data-type part)))
      (is (= {:type    "card"
              :id      "card-1"
              :title   "My Chart"
              :query   {:id "q1" :query query}
              :display "bar"}
             (:data part)))))
  (testing "omits :display when not provided"
    (let [part (streaming/viz-part {:entity-id "card-2"
                                    :query-id  "q2"
                                    :query     {:database 1}
                                    :title     "No Display"})]
      (is (= {:type  "card"
              :id    "card-2"
              :title "No Display"
              :query {:id "q2" :query {:database 1}}}
             (:data part)))
      (is (not (contains? (:data part) :display))))))

(deftest dashboard-entity-part-test
  (testing "emits a dashboard generated_entity"
    (let [part (streaming/dashboard-entity-part {:title "Orders" :url "/auto/dashboard/table/123"})]
      (is (= :data (:type part)))
      (is (= "generated_entity" (:data-type part)))
      (is (= {:type "dashboard" :url "/auto/dashboard/table/123" :title "Orders"}
             (:data part)))
      (is (not (contains? (:data part) :id)))))
  (testing "includes :id when provided"
    (let [part (streaming/dashboard-entity-part {:title "Orders" :url "/dashboard/9" :id 9})]
      (is (= {:type "dashboard" :url "/dashboard/9" :title "Orders" :id 9}
             (:data part))))))

(deftest query->question-url-test
  (testing "converts query to /question# URL"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          url (streaming/query->question-url query)]
      (is (str/starts-with? url "/question#"))
      (is (> (count url) 10))))
  (testing "handles complex queries"
    (let [query {:database 1
                 :type :query
                 :query {:source-table 1
                         :filter [:= [:field 1 nil] "test"]
                         :aggregation [[:count]]}}
          url (streaming/query->question-url query)]
      (is (str/starts-with? url "/question#")))))

(deftest state-part-test
  (testing "creates state data part"
    (let [state {:queries {"q1" {:database 1}} :charts {"c1" {:type :bar}}}
          part (streaming/state-part state)]
      (is (= :data (:type part)))
      (is (= "state" (:data-type part)))
      (is (= state (:data part))))))

;;; New Data Part Types (AI Service Parity)

(deftest todo-list-part-test
  (testing "creates todo_list data part with correct structure"
    (let [todos [{:id "1" :content "Task 1" :status "pending" :priority "high"}
                 {:id "2" :content "Task 2" :status "completed" :priority "low"}]
          part (streaming/todo-list-part todos)]
      (is (= :data (:type part)))
      (is (= "todo_list" (:data-type part)))
      (is (= todos (:data part)))))
  (testing "handles empty todo list"
    (let [part (streaming/todo-list-part [])]
      (is (= :data (:type part)))
      (is (= "todo_list" (:data-type part)))
      (is (= [] (:data part))))))

(deftest code-edit-part-test
  (testing "creates code_edit data part with correct structure"
    (let [edit-data {:buffer_id "buffer-123"
                     :mode "rewrite"
                     :value "SELECT * FROM users"}
          part (streaming/code-edit-part edit-data)]
      (is (= :data (:type part)))
      (is (= "code_edit" (:data-type part)))
      (is (= edit-data (:data part)))))
  (testing "handles complex edit data"
    (let [edit-data {:buffer_id "buf-1"
                     :mode "edit"
                     :edits [{:old_string "foo" :new_string "bar"}
                             {:old_string "baz" :new_string "qux" :replace_all true}]}
          part (streaming/code-edit-part edit-data)]
      (is (= edit-data (:data part))))))

(deftest transform-suggestion-part-test
  (testing "creates transform_suggestion data part with correct structure"
    (let [suggestion {:id 1
                      :name "My Transform"
                      :description "A test transform"
                      :source {:type "sql" :query "SELECT 1"}}
          part (streaming/transform-suggestion-part suggestion)]
      (is (= :data (:type part)))
      (is (= "transform_suggestion" (:data-type part)))
      (is (= suggestion (:data part)))))
  (testing "handles Python transform suggestion"
    (let [suggestion {:id 2
                      :name "Python Transform"
                      :source {:type "python"
                               :query "def transform():\n    return pd.DataFrame()"}}
          part (streaming/transform-suggestion-part suggestion)]
      (is (= suggestion (:data part))))))

(deftest adhoc-viz-part-test
  (testing "creates adhoc_viz data part with correct structure"
    (let [value {:query {:database 1 :type :query :query {:source-table 1}}
                 :link "/question#abc123"
                 :title "My Query"
                 :display "bar"}
          part (streaming/adhoc-viz-part value)]
      (is (= :data (:type part)))
      (is (= "adhoc_viz" (:data-type part)))
      (is (= value (:data part)))))
  (testing "handles minimal value without title/display"
    (let [value {:query {:database 1} :link "/question#xyz"}
          part (streaming/adhoc-viz-part value)]
      (is (= :data (:type part)))
      (is (= "adhoc_viz" (:data-type part)))
      (is (= value (:data part))))))

(deftest static-viz-part-test
  (testing "creates static_viz data part with correct structure"
    (let [value {:entity_id 42}
          part (streaming/static-viz-part value)]
      (is (= :data (:type part)))
      (is (= "static_viz" (:data-type part)))
      (is (= value (:data part))))))

(deftest data-type-constants-test
  (testing "data type constants are defined correctly"
    (is (= "state" streaming/state-type))
    (is (= "todo_list" streaming/todo-list-type))
    (is (= "code_edit" streaming/code-edit-type))
    (is (= "transform_suggestion" streaming/transform-suggestion-type))
    (is (= "generated_entity" streaming/generated-entity-type))
    (is (= "adhoc_viz" streaming/adhoc-viz-type))
    (is (= "static_viz" streaming/static-viz-type))))

(deftest persistable-data-part?-test
  (testing "state parts are not persisted (value lives on MetabotConversation.state)"
    (is (false? (streaming/persistable-data-part? (streaming/state-part {:queries {}})))))
  (testing "other parts are persisted"
    (is (true? (streaming/persistable-data-part? (streaming/todo-list-part []))))
    (is (true? (streaming/persistable-data-part? {:type :text :text "hi"})))))

;;; Transducer Tests

(deftest expand-data-parts-xf-test
  (testing "expands data-parts from tool-output results"
    (let [todo-part {:type :data :data-type "todo_list" :data [{:id "1"}]}
          parts [{:type :tool-output
                  :id "t1"
                  :result {:output "done"
                           :data-parts [todo-part]}}]
          result (into [] streaming/expand-data-parts-xf parts)]
      (is (= 2 (count result)))
      (is (= :tool-output (:type (first result))))
      (is (= todo-part (second result)))))
  (testing "passes through non-tool-output parts unchanged"
    (let [parts [{:type :text :text "hello"}]
          result (into [] streaming/expand-data-parts-xf parts)]
      (is (= parts result))))
  (testing "handles tool-output without data-parts"
    (let [parts [{:type :tool-output :id "t1" :result {:output "done"}}]
          result (into [] streaming/expand-data-parts-xf parts)]
      (is (= 1 (count result)))))
  (testing "handles multiple data-parts from single tool"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :result {:data-parts [{:type :data :data-type "a"}
                                        {:type :data :data-type "b"}]}}]
          result (into [] streaming/expand-data-parts-xf parts)]
      (is (= 3 (count result)))
      (is (= "a" (:data-type (second result))))
      (is (= "b" (:data-type (nth result 2)))))))

(deftest resolve-links-xf-test
  (testing "resolves metabase:// links in text parts"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          parts [{:type :text :text "[Results](metabase://query/q1)"}]
          result (into [] (streaming/post-process-xf {"q1" query} {} (atom {})) parts)]
      (is (= 1 (count result)))
      (is (re-find #"\[Results\]\(/question#" (:text (first result))))))
  (testing "passes through non-text parts unchanged"
    (let [parts [{:type :tool-input :id "t1" :function "search"}]
          result (into [] (streaming/post-process-xf {} {} (atom {})) parts)]
      (is (= parts result))))
  (testing "accumulates queries from tool-output structured-output"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          parts [{:type :tool-output
                  :id "t1"
                  :result {:structured-output {:query-id "q1" :query query}}}
                 {:type :text :text "[Results](metabase://query/q1)"}]
          result (into [] (streaming/post-process-xf {} {} (atom {})) parts)]
      (is (= 2 (count result)))
      (is (re-find #"\[Results\]\(/question#" (:text (second result))))))
  (testing "flushes incomplete links at end"
    (let [parts [{:type :text :text "Check [incomplete"}]
          result (into [] (streaming/post-process-xf {} {} (atom {})) parts)]
      ;; Should have original part (with empty/partial text) + flushed part
      (is (<= 1 (count result)))
      (let [all-text (->> result (filter #(= :text (:type %))) (map :text) (apply str))]
        (is (= "Check [incomplete" all-text)))))
  (testing "resolves model/metric/dashboard links without state"
    (let [parts [{:type :text :text "[Model](metabase://model/123)"}]
          result (into [] (streaming/post-process-xf {} {} (atom {})) parts)]
      (is (= "[Model](/model/123)" (:text (first result)))))))

(deftest post-process-xf-test
  (testing "composes all post-processing transducers"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          parts [{:type :tool-output
                  :id "t1"
                  :result {:structured-output {:query-id "q1" :query query}
                           :data-parts [{:type :data :data-type "todo_list" :data []}]}}
                 {:type :text :text "[Link](metabase://query/q1)"}]
          result (into [] (streaming/post-process-xf {} {} (atom {})) parts)]
      ;; Should have: tool-output, todo_list data part, resolved text
      (is (= 3 (count result)))
      (is (= :tool-output (:type (nth result 0))))
      (is (= "todo_list" (:data-type (nth result 1))))
      (is (re-find #"\[Link\]\(/question#" (:text (nth result 2))))))
  (testing "works with empty parts"
    (let [result (into [] (streaming/post-process-xf {} {} (atom {})) [])]
      (is (= [] result))))
  (testing "preserves order: tool-output, data-parts, text"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :result {:data-parts [{:type :data :data-type "dp"}]}}
                 {:type :text :text "text"}]
          result (into [] (streaming/post-process-xf {} {} (atom {})) parts)]
      (is (= :tool-output (:type (nth result 0))))
      (is (= "dp" (:data-type (nth result 1))))
      (is (= "text" (:text (nth result 2)))))))
