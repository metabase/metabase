(ns metabase-enterprise.metabot-v3.tools.todo-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.todo :as todo]))

(deftest todo-write-test
  (testing "todo-write validates and stores todos in memory"
    (let [memory-atom (atom {:state {}})
          todos [{:id "1" :content "First task" :status "pending" :priority "high"}
                 {:id "2" :content "Second task" :status "in_progress" :priority "medium"}]
          result (todo/todo-write {:todos todos :memory-atom memory-atom})]
      (is (map? result))
      (is (contains? result :structured-output))
      (is (contains? result :data-parts))
      (is (contains? result :instructions))
      ;; Check memory was updated
      (is (= todos (get-in @memory-atom [:state :todos])))))

  (testing "todo-write returns data-parts with todo_list type"
    (let [memory-atom (atom {:state {}})
          todos [{:id "1" :content "Task" :status "pending" :priority "low"}]
          result (todo/todo-write {:todos todos :memory-atom memory-atom})
          data-part (first (:data-parts result))]
      (is (= :data (:type data-part)))
      (is (= "todo_list" (:data-type data-part)))
      (is (= 1 (:version data-part)))
      (is (= todos (:data data-part)))))

  (testing "todo-write rejects invalid status"
    (let [memory-atom (atom {:state {}})
          todos [{:id "1" :content "Task" :status "invalid_status" :priority "high"}]]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid todo status"
           (todo/todo-write {:todos todos :memory-atom memory-atom})))))

  (testing "todo-write rejects invalid priority"
    (let [memory-atom (atom {:state {}})
          todos [{:id "1" :content "Task" :status "pending" :priority "critical"}]]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid todo priority"
           (todo/todo-write {:todos todos :memory-atom memory-atom})))))

  (testing "todo-write rejects missing id"
    (let [memory-atom (atom {:state {}})
          todos [{:content "Task" :status "pending" :priority "high"}]]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"missing required 'id' field"
           (todo/todo-write {:todos todos :memory-atom memory-atom})))))

  (testing "todo-write rejects missing content"
    (let [memory-atom (atom {:state {}})
          todos [{:id "1" :status "pending" :priority "high"}]]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"missing required 'content' field"
           (todo/todo-write {:todos todos :memory-atom memory-atom})))))

  (testing "todo-write accepts all valid statuses"
    (let [memory-atom (atom {:state {}})]
      (doseq [status ["pending" "in_progress" "completed" "cancelled"]]
        (let [todos [{:id "1" :content "Task" :status status :priority "medium"}]
              result (todo/todo-write {:todos todos :memory-atom memory-atom})]
          (is (some? (:structured-output result)))))))

  (testing "todo-write accepts all valid priorities"
    (let [memory-atom (atom {:state {}})]
      (doseq [priority ["high" "medium" "low"]]
        (let [todos [{:id "1" :content "Task" :status "pending" :priority priority}]
              result (todo/todo-write {:todos todos :memory-atom memory-atom})]
          (is (some? (:structured-output result))))))))

(deftest todo-read-test
  (testing "todo-read returns empty list when no todos in memory"
    (let [memory-atom (atom {:state {}})
          result (todo/todo-read {:memory-atom memory-atom})]
      (is (map? result))
      (is (contains? result :structured-output))
      (is (= [] (get-in result [:structured-output :todos])))
      (is (= 0 (get-in result [:structured-output :todo_count])))))

  (testing "todo-read returns stored todos"
    (let [todos [{:id "1" :content "Task 1" :status "pending" :priority "high"}
                 {:id "2" :content "Task 2" :status "completed" :priority "low"}]
          memory-atom (atom {:state {:todos todos}})
          result (todo/todo-read {:memory-atom memory-atom})]
      (is (= todos (get-in result [:structured-output :todos])))
      (is (= 2 (get-in result [:structured-output :todo_count])))))

  (testing "todo-read includes instructions for LLM"
    (let [memory-atom (atom {:state {:todos [{:id "1" :content "Task" :status "pending" :priority "medium"}]}})
          result (todo/todo-read {:memory-atom memory-atom})]
      (is (contains? result :instructions))
      (is (string? (:instructions result))))))

(deftest todo-write-tool-test
  (testing "todo-write-tool catches exceptions and returns error output"
    (let [memory-atom (atom {:state {}})
          result (todo/todo-write-tool {:todos [{:id "1" :content "Task" :status "bad" :priority "high"}]
                                        :memory-atom memory-atom})]
      (is (contains? result :output))
      (is (string? (:output result))))))

(deftest todo-read-tool-test
  (testing "todo-read-tool works with valid input"
    (let [memory-atom (atom {:state {:todos []}})
          result (todo/todo-read-tool {:memory-atom memory-atom})]
      (is (contains? result :structured-output)))))
