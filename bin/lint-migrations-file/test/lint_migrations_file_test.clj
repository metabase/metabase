(ns lint-migrations-file-test
  (:require [clojure.test :refer :all]
            [lint-migrations-file :as lint-migrations-file]))

(defn mock-change-set [& keyvals]
  {:changeSet
   (merge
    {:id      1
     :author  "camsaul"
     :comment "Added x.37.0"
     :changes [{:whatever {}}]}
    (apply array-map keyvals))})

(defn mock-column [& keyvals]
  {:column (merge {:name "bird_count", :type "integer"}
                  (apply array-map keyvals))})

(defn- mock-add-column-changes [& keyvals]
  {:addColumn (merge {:tableName "my_table"
                      :columns   [(mock-column)]}
                     (apply array-map keyvals))})

(defn- validate [& changes]
  (lint-migrations-file/validate-migrations
   {:databaseChangeLog changes}))

(deftest require-unique-ids-test
  (testing "Make sure all migration IDs are unique"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"distinct-change-set-ids"
         (validate
          (mock-change-set :id "1")
          (mock-change-set :id 1))))))

(deftest require-migrations-in-order-test
  (testing "Migrations must be in order"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"change-set-ids-in-order"
         (validate
          (mock-change-set :id 2)
          (mock-change-set :id 1))))))

(deftest only-one-column-per-add-column-test
  (testing "we should only allow one column per addColumn change"
    (is (= :ok
           (validate
            (mock-change-set :changes [(mock-add-column-changes)]))))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Extra input"
         (validate
          (mock-change-set :changes [(mock-add-column-changes :columns [(mock-column :name "A")
                                                                        (mock-column :name "B")])]))))))

(deftest one-change-per-change-set-test
  (testing "[strict only] only allow one change per change set"
    (is (= :ok
           (validate
            (mock-change-set :changes [(mock-add-column-changes) (mock-add-column-changes)]))))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Extra input"
         (validate
          (mock-change-set :id 200
                           :changes [(mock-add-column-changes) (mock-add-column-changes)]))))))

(deftest require-comment-test
  (testing "[strict only] require a 'Added <version>' comment for a change set"
    (is (= :ok
           (validate (dissoc (mock-change-set) :comment))))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"clojure.core/re-find"
         (validate (mock-change-set :id 200, :comment "Bad comment"))))
    (is (= :ok
           (validate (mock-change-set :id 200, :comment "Added x.38.0"))))))
