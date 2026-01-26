(ns metabase-enterprise.metabot-v3.agent.streaming-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]))

(deftest navigate-to-part-test
  (testing "creates correct navigate_to data part structure"
    (let [url "/question#abc123"
          part (streaming/navigate-to-part url)]
      (is (= :data (:type part)))
      (is (= "navigate_to" (:data-type part)))
      (is (= url (:data part)))))

  (testing "works with various URL formats"
    (let [part1 (streaming/navigate-to-part "/model/123")
          part2 (streaming/navigate-to-part "/metric/456")
          part3 (streaming/navigate-to-part "/dashboard/789")]
      (is (= "/model/123" (:data part1)))
      (is (= "/metric/456" (:data part2)))
      (is (= "/dashboard/789" (:data part3))))))

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

(deftest reactions->data-parts-test
  (testing "converts redirect reactions to navigate_to data parts"
    (let [reactions [{:type :metabot.reaction/redirect :url "/question#xyz"}]
          parts (streaming/reactions->data-parts reactions)]
      (is (= 1 (count parts)))
      (is (= :data (:type (first parts))))
      (is (= "navigate_to" (:data-type (first parts))))
      (is (= "/question#xyz" (:data (first parts))))))

  (testing "handles multiple reactions"
    (let [reactions [{:type :metabot.reaction/redirect :url "/model/1"}
                     {:type :metabot.reaction/redirect :url "/metric/2"}]
          parts (streaming/reactions->data-parts reactions)]
      (is (= 2 (count parts)))
      (is (= "/model/1" (:data (first parts))))
      (is (= "/metric/2" (:data (second parts))))))

  (testing "ignores non-redirect reactions"
    (let [reactions [{:type :metabot.reaction/message :message "hello"}
                     {:type :metabot.reaction/redirect :url "/model/1"}
                     {:type :unknown/reaction :data "foo"}]
          parts (streaming/reactions->data-parts reactions)]
      (is (= 1 (count parts)))
      (is (= "/model/1" (:data (first parts))))))

  (testing "returns empty vector for empty reactions"
    (is (= [] (streaming/reactions->data-parts [])))
    (is (= [] (streaming/reactions->data-parts nil)))))

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
      (is (= 1 (:version part)))
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
      (is (= 1 (:version part)))
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
      (is (= 1 (:version part)))
      (is (= suggestion (:data part)))))

  (testing "handles Python transform suggestion"
    (let [suggestion {:id 2
                      :name "Python Transform"
                      :source {:type "python"
                               :query "def transform():\n    return pd.DataFrame()"}}
          part (streaming/transform-suggestion-part suggestion)]
      (is (= suggestion (:data part))))))

(deftest data-type-constants-test
  (testing "data type constants are defined correctly"
    (is (= "navigate_to" streaming/navigate-to-type))
    (is (= "state" streaming/state-type))
    (is (= "todo_list" streaming/todo-list-type))
    (is (= "code_edit" streaming/code-edit-type))
    (is (= "transform_suggestion" streaming/transform-suggestion-type))))

;;; Transducer Tests

(deftest expand-reactions-xf-test
  (testing "expands reactions from tool-output parts"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :result {:output "done"
                           :reactions [{:type :metabot.reaction/redirect :url "/question#abc"}]}}]
          result (into [] streaming/expand-reactions-xf parts)]
      (is (= 2 (count result)))
      (is (= :tool-output (:type (first result))))
      (is (= :data (:type (second result))))
      (is (= "navigate_to" (:data-type (second result))))))

  (testing "passes through non-tool-output parts unchanged"
    (let [parts [{:type :text :text "hello"}
                 {:type :usage :tokens 100}]
          result (into [] streaming/expand-reactions-xf parts)]
      (is (= parts result))))

  (testing "handles tool-output without reactions"
    (let [parts [{:type :tool-output :id "t1" :result {:output "done"}}]
          result (into [] streaming/expand-reactions-xf parts)]
      (is (= 1 (count result)))
      (is (= :tool-output (:type (first result))))))

  (testing "handles multiple reactions from single tool"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :result {:reactions [{:type :metabot.reaction/redirect :url "/a"}
                                       {:type :metabot.reaction/redirect :url "/b"}]}}]
          result (into [] streaming/expand-reactions-xf parts)]
      (is (= 3 (count result)))
      (is (= "/a" (:data (second result))))
      (is (= "/b" (:data (nth result 2)))))))

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
          result (into [] (streaming/resolve-links-xf {"q1" query} {}) parts)]
      (is (= 1 (count result)))
      (is (re-find #"\[Results\]\(/question#" (:text (first result))))))

  (testing "passes through non-text parts unchanged"
    (let [parts [{:type :tool-input :id "t1" :function "search"}]
          result (into [] (streaming/resolve-links-xf {} {}) parts)]
      (is (= parts result))))

  (testing "accumulates queries from tool-output structured-output"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          parts [{:type :tool-output
                  :id "t1"
                  :result {:structured-output {:query-id "q1" :query query}}}
                 {:type :text :text "[Results](metabase://query/q1)"}]
          result (into [] (streaming/resolve-links-xf {} {}) parts)]
      (is (= 2 (count result)))
      (is (re-find #"\[Results\]\(/question#" (:text (second result))))))

  (testing "flushes incomplete links at end"
    (let [parts [{:type :text :text "Check [incomplete"}]
          result (into [] (streaming/resolve-links-xf {} {}) parts)]
      ;; Should have original part (with empty/partial text) + flushed part
      (is (<= 1 (count result)))
      (let [all-text (->> result (filter #(= :text (:type %))) (map :text) (apply str))]
        (is (= "Check [incomplete" all-text)))))

  (testing "resolves model/metric/dashboard links without state"
    (let [parts [{:type :text :text "[Model](metabase://model/123)"}]
          result (into [] (streaming/resolve-links-xf {} {}) parts)]
      (is (= "[Model](/model/123)" (:text (first result)))))))

(deftest post-process-xf-test
  (testing "composes all post-processing transducers"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          parts [{:type :tool-output
                  :id "t1"
                  :result {:structured-output {:query-id "q1" :query query}
                           :reactions [{:type :metabot.reaction/redirect :url "/nav"}]
                           :data-parts [{:type :data :data-type "todo_list" :data []}]}}
                 {:type :text :text "[Link](metabase://query/q1)"}]
          result (into [] (streaming/post-process-xf {} {}) parts)]
      ;; Should have: tool-output, navigate_to data part, todo_list data part, resolved text
      (is (= 4 (count result)))
      (is (= :tool-output (:type (nth result 0))))
      (is (= "navigate_to" (:data-type (nth result 1))))
      (is (= "todo_list" (:data-type (nth result 2))))
      (is (re-find #"\[Link\]\(/question#" (:text (nth result 3))))))

  (testing "works with empty parts"
    (let [result (into [] (streaming/post-process-xf {} {}) [])]
      (is (= [] result))))

  (testing "preserves order: tool-output, reactions, data-parts, text"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :result {:reactions [{:type :metabot.reaction/redirect :url "/r"}]
                           :data-parts [{:type :data :data-type "dp"}]}}
                 {:type :text :text "text"}]
          result (into [] (streaming/post-process-xf {} {}) parts)]
      (is (= :tool-output (:type (nth result 0))))
      (is (= "navigate_to" (:data-type (nth result 1))))
      (is (= "dp" (:data-type (nth result 2))))
      (is (= "text" (:text (nth result 3)))))))
