(ns metabase-enterprise.metabot-v3.tools.transforms-write-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.transforms-write :as transforms-write]))

;;; Edit Application Tests

(deftest apply-edits-test
  (testing "replace mode replaces entire content"
    (let [memory-atom (atom {:state {}})
          result (transforms-write/write-transform-sql
                  {:edit_action {:mode "replace"
                                 :new_content "SELECT * FROM users"}
                   :transform_name "Test Transform"
                   :memory-atom memory-atom})]
      (is (= "SELECT * FROM users"
             (get-in result [:structured-output :transform :source :query])))))

  (testing "edit mode with single edit"
    (let [existing-transform {:id 1
                              :name "Existing"
                              :source {:query "SELECT id FROM orders"}}
          memory-atom (atom {:state {:transforms {"1" existing-transform}}})
          result (transforms-write/write-transform-sql
                  {:transform_id 1
                   :edit_action {:mode "edit"
                                 :edits [{:old_string "orders"
                                          :new_string "customers"}]}
                   :memory-atom memory-atom})]
      (is (= "SELECT id FROM customers"
             (get-in result [:structured-output :transform :source :query])))))

  (testing "edit mode with multiple edits"
    (let [existing-transform {:id 1
                              :name "Existing"
                              :source {:query "SELECT col_a, col_b FROM table1"}}
          memory-atom (atom {:state {:transforms {"1" existing-transform}}})
          result (transforms-write/write-transform-sql
                  {:transform_id 1
                   :edit_action {:mode "edit"
                                 :edits [{:old_string "col_a" :new_string "col_x"}
                                         {:old_string "col_b" :new_string "col_y"}
                                         {:old_string "table1" :new_string "table2"}]}
                   :memory-atom memory-atom})]
      (is (= "SELECT col_x, col_y FROM table2"
             (get-in result [:structured-output :transform :source :query])))))

  (testing "edit mode fails when text not found"
    (let [existing-transform {:id 1
                              :name "Existing"
                              :source {:query "SELECT * FROM users"}}
          memory-atom (atom {:state {:transforms {"1" existing-transform}}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Could not find text"
           (transforms-write/write-transform-sql
            {:transform_id 1
             :edit_action {:mode "edit"
                           :edits [{:old_string "nonexistent"
                                    :new_string "replacement"}]}
             :memory-atom memory-atom})))))

  (testing "edit mode fails for ambiguous matches without replace_all"
    (let [existing-transform {:id 1
                              :name "Existing"
                              :source {:query "SELECT foo, foo FROM mytable"}}
          memory-atom (atom {:state {:transforms {"1" existing-transform}}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Found 2 matches"
           (transforms-write/write-transform-sql
            {:transform_id 1
             :edit_action {:mode "edit"
                           :edits [{:old_string "foo"
                                    :new_string "bar"}]}
             :memory-atom memory-atom})))))

  (testing "edit mode with replace_all replaces all occurrences"
    (let [existing-transform {:id 1
                              :name "Existing"
                              :source {:query "SELECT xyz, xyz, xyz FROM mytable"}}
          memory-atom (atom {:state {:transforms {"1" existing-transform}}})
          result (transforms-write/write-transform-sql
                  {:transform_id 1
                   :edit_action {:mode "edit"
                                 :edits [{:old_string "xyz"
                                          :new_string "abc"
                                          :replace_all true}]}
                   :memory-atom memory-atom})]
      (is (= "SELECT abc, abc, abc FROM mytable"
             (get-in result [:structured-output :transform :source :query]))))))

;;; Transform Creation Tests

(deftest create-fresh-transform-test
  (testing "creates fresh SQL transform when no transform_id"
    (let [memory-atom (atom {:state {}})
          result (transforms-write/write-transform-sql
                  {:edit_action {:mode "replace"
                                 :new_content "SELECT 1"}
                   :transform_name "New Transform"
                   :transform_description "A test transform"
                   :memory-atom memory-atom})]
      (is (= "New Transform" (get-in result [:structured-output :transform :name])))
      (is (= "A test transform" (get-in result [:structured-output :transform :description])))
      (is (= "SELECT 1" (get-in result [:structured-output :transform :source :query])))))

  (testing "creates fresh Python transform"
    (let [memory-atom (atom {:state {}})
          result (transforms-write/write-transform-python
                  {:edit_action {:mode "replace"
                                 :new_content "def transform():\n    return pd.DataFrame()"}
                   :transform_name "Python Transform"
                   :memory-atom memory-atom})]
      (is (= "Python Transform" (get-in result [:structured-output :transform :name])))
      (is (= "python" (get-in result [:structured-output :transform :source :type]))))))

;;; Data Parts Tests

(deftest data-parts-test
  (testing "returns transform_suggestion data part"
    (let [memory-atom (atom {:state {}})
          result (transforms-write/write-transform-sql
                  {:edit_action {:mode "replace" :new_content "SELECT 1"}
                   :transform_name "Test"
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
    (let [existing-transform {:id 1 :name "Existing" :source {:query "SELECT 1"}}
          memory-atom (atom {:state {:transforms {"1" existing-transform}}})
          _ (transforms-write/write-transform-sql
             {:transform_id 1
              :edit_action {:mode "replace" :new_content "SELECT 2"}
              :memory-atom memory-atom})]
      (is (= "SELECT 2" (get-in @memory-atom [:state :transforms "1" :source :query])))))

  (testing "does not store in memory when no transform_id"
    (let [memory-atom (atom {:state {:transforms {}}})
          _ (transforms-write/write-transform-sql
             {:edit_action {:mode "replace" :new_content "SELECT 1"}
              :transform_name "New"
              :memory-atom memory-atom})]
      (is (empty? (get-in @memory-atom [:state :transforms]))))))

;;; Error Handling Tests

(deftest error-handling-test
  (testing "fails when transform_id not found"
    (let [memory-atom (atom {:state {:transforms {}}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Transform with ID 999 not found"
           (transforms-write/write-transform-sql
            {:transform_id 999
             :edit_action {:mode "replace" :new_content "SELECT 1"}
             :memory-atom memory-atom})))))

  (testing "fails when edit_action invalid"
    (let [memory-atom (atom {:state {}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid edit_action"
           (transforms-write/write-transform-sql
            {:edit_action {:mode "invalid"}
             :memory-atom memory-atom}))))))
