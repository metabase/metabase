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
