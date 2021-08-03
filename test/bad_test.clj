(ns bad-test
  (:require [clojure.test :refer :all]))

(deftest failing-test
  (testing "context 1"
    (is (= 1 2))
    (testing "\ncontext 2"
      (is (= {:a 1, :b 2, :c 3}
             {:a 1, :b 2, :c 4})))))

(deftest ok-test
  (testing "context 1"
    (is (= 1 2))
    (testing "context 2"
      (is (= [1 2 3] [1 2 3])))))

(deftest error-test
  (testing "ERROR"
    (is (= 100
           (throw (ex-info "OOps" {:data 100}))))))
