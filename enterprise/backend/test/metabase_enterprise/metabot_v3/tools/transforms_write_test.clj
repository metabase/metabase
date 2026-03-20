(ns metabase-enterprise.metabot-v3.tools.transforms-write-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.transforms-write :as transforms-write]))

;;; Edit Application Tests

(deftest apply-edits-test
  (testing "replace mode replaces entire content"
    (let [memory-atom (atom {:state {}})
          result (transforms-write/write-transform-sql
                  {:mode "replace"
                   :new_content "SELECT * FROM users"
                   :transform_name "Test Transform"
                   :source_database 1
                   :memory-atom memory-atom})]
      (is (= "SELECT * FROM users"
             (get-in result [:structured-output :transform :source :query :native :query])))))

  (testing "edit mode with single edit"
    (let [existing-transform {:id 1
                              :name "Existing"
                              :source {:type "query"
                                       :query {:type "native"
                                               :database 1
                                               :native {:query "SELECT id FROM orders"}}}}
          memory-atom (atom {:state {:transforms {"1" existing-transform}}})
          result (transforms-write/write-transform-sql
                  {:transform_id 1
                   :mode "edit"
                   :edits [{:old_string "orders"
                            :new_string "customers"}]
                   :memory-atom memory-atom})]
      (is (= "SELECT id FROM customers"
             (get-in result [:structured-output :transform :source :query :native :query])))))

  (testing "edit mode with multiple edits"
    (let [existing-transform {:id 1
                              :name "Existing"
                              :source {:type "query"
                                       :query {:type "native"
                                               :database 1
                                               :native {:query "SELECT col_a, col_b FROM table1"}}}}
          memory-atom (atom {:state {:transforms {"1" existing-transform}}})
          result (transforms-write/write-transform-sql
                  {:transform_id 1
                   :mode "edit"
                   :edits [{:old_string "col_a" :new_string "col_x"}
                           {:old_string "col_b" :new_string "col_y"}
                           {:old_string "table1" :new_string "table2"}]
                   :memory-atom memory-atom})]
      (is (= "SELECT col_x, col_y FROM table2"
             (get-in result [:structured-output :transform :source :query :native :query])))))

  (testing "edit mode fails when text not found"
    (let [existing-transform {:id 1
                              :name "Existing"
                              :source {:type "query"
                                       :query {:type "native"
                                               :database 1
                                               :native {:query "SELECT * FROM users"}}}}
          memory-atom (atom {:state {:transforms {"1" existing-transform}}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Could not find text"
           (transforms-write/write-transform-sql
            {:transform_id 1
             :mode "edit"
             :edits [{:old_string "nonexistent"
                      :new_string "replacement"}]
             :memory-atom memory-atom})))))

  (testing "edit mode fails for ambiguous matches without replace_all"
    (let [existing-transform {:id 1
                              :name "Existing"
                              :source {:type "query"
                                       :query {:type "native"
                                               :database 1
                                               :native {:query "SELECT foo, foo FROM mytable"}}}}
          memory-atom (atom {:state {:transforms {"1" existing-transform}}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Found 2 matches"
           (transforms-write/write-transform-sql
            {:transform_id 1
             :mode "edit"
             :edits [{:old_string "foo"
                      :new_string "bar"}]
             :memory-atom memory-atom})))))

  (testing "edit mode with replace_all replaces all occurrences"
    (let [existing-transform {:id 1
                              :name "Existing"
                              :source {:type "query"
                                       :query {:type "native"
                                               :database 1
                                               :native {:query "SELECT xyz, xyz, xyz FROM mytable"}}}}
          memory-atom (atom {:state {:transforms {"1" existing-transform}}})
          result (transforms-write/write-transform-sql
                  {:transform_id 1
                   :mode "edit"
                   :edits [{:old_string "xyz"
                            :new_string "abc"
                            :replace_all true}]
                   :memory-atom memory-atom})]
      (is (= "SELECT abc, abc, abc FROM mytable"
             (get-in result [:structured-output :transform :source :query :native :query]))))))

;;; Transform Creation Tests

(deftest create-fresh-transform-test
  (testing "creates fresh SQL transform when no transform_id"
    (let [memory-atom (atom {:state {}})
          result (transforms-write/write-transform-sql
                  {:mode "replace"
                   :new_content "SELECT 1"
                   :transform_name "New Transform"
                   :transform_description "A test transform"
                   :source_database 1
                   :memory-atom memory-atom})]
      (is (= "New Transform" (get-in result [:structured-output :transform :name])))
      (is (= "A test transform" (get-in result [:structured-output :transform :description])))
      (is (= "query" (get-in result [:structured-output :transform :source :type])))
      (is (= "SELECT 1" (get-in result [:structured-output :transform :source :query :native :query])))))

  (testing "creates fresh Python transform"
    (let [memory-atom (atom {:state {}})
          result (transforms-write/write-transform-python
                  {:mode "replace"
                   :new_content "def transform():\n    return pd.DataFrame()"
                   :transform_name "Python Transform"
                   :source_database 1
                   :memory-atom memory-atom})]
      (is (= "Python Transform" (get-in result [:structured-output :transform :name])))
      (is (= "python" (get-in result [:structured-output :transform :source :type]))))))

(deftest create-fresh-python-template-test
  (testing "fresh Python transforms include common import"
    (let [result (#'transforms-write/create-fresh-python-transform
                  "Python Transform" nil 1 nil)]
      (is (= "import common\nimport pandas as pd\n\ndef transform():\n    # Your transformation logic here\n    return pd.DataFrame([{\"message\": \"Hello from Python transform!\"}])\n"
             (get-in result [:source :body]))))))

;;; Data Parts Tests

(deftest data-parts-test
  (testing "returns transform_suggestion data part"
    (let [memory-atom (atom {:state {}})
          result (transforms-write/write-transform-sql
                  {:mode "replace"
                   :new_content "SELECT 1"
                   :transform_name "Test"
                   :source_database 1
                   :memory-atom memory-atom})]
      (is (contains? result :data-parts))
      (is (= 1 (count (:data-parts result))))
      (let [data-part (first (:data-parts result))]
        (is (= :data (:type data-part)))
        (is (= "transform_suggestion" (:data-type data-part)))
        (is (= 1 (:version data-part)))))))

;;; Memory Storage Tests

(deftest memory-storage-test
  (testing "stores updated transform in memory when transform_id provided"
    (let [existing-transform {:id 1
                              :name "Existing"
                              :source {:type "query"
                                       :query {:type "native"
                                               :database 1
                                               :native {:query "SELECT 1"}}}}
          memory-atom (atom {:state {:transforms {"1" existing-transform}}})
          _ (transforms-write/write-transform-sql
             {:transform_id 1
              :mode "replace"
              :new_content "SELECT 2"
              :memory-atom memory-atom})]
      (is (= "SELECT 2" (get-in @memory-atom [:state :transforms "1" :source :query :native :query])))))

  (testing "stores new transform with generated ID when no transform_id"
    (let [memory-atom (atom {:state {:transforms {}}})
          result (transforms-write/write-transform-sql
                  {:mode "replace"
                   :new_content "SELECT 1"
                   :transform_name "New"
                   :source_database 1
                   :memory-atom memory-atom})
          generated-id (get-in result [:structured-output :transform-id])]
      (is (some? generated-id) "Should generate a transform ID")
      (is (= 1 (count (get-in @memory-atom [:state :transforms]))) "Should store one transform")
      (is (= "SELECT 1" (get-in @memory-atom [:state :transforms generated-id :source :query :native :query]))
          "Should store the transform with the generated ID"))))

;;; Error Handling Tests

(deftest error-handling-test
  (testing "fails when transform_id not found"
    (let [memory-atom (atom {:state {:transforms {}}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Transform with ID 999 not found"
           (transforms-write/write-transform-sql
            {:transform_id 999
             :mode "replace"
             :new_content "SELECT 1"
             :memory-atom memory-atom})))))

  (testing "fails when mode is invalid"
    (let [memory-atom (atom {:state {}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid input"
           (transforms-write/write-transform-sql
            {:mode "invalid"
             :source_database 1
             :memory-atom memory-atom}))))))
