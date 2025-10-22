(ns metabase-enterprise.representations.import-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.import :as import]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest order-representations-self-reference-test
  (testing "order-representations throws exception when representation refers to itself"
    (let [reps [{:ref "a" :database "ref:a"}]]
      (is (thrown? Exception (import/order-representations reps))))))

(deftest order-representations-circular-reference-test
  (testing "order-representations throws exception when representations have circular dependency"
    (let [reps [{:ref "a" :database "ref:b"}
                {:ref "b" :database "ref:a"}]]
      (is (thrown? Exception (import/order-representations reps))))))

(deftest order-representations-empty-test
  (testing "order-representations handles empty list"
    (is (= [] (import/order-representations [])))))

(deftest order-representations-chain-test
  (testing "order-representations orders chain correctly"
    (let [reps [{:ref "a" :type :question :database "ref:b"}
                {:ref "c" :type :model :database "ref:d"}
                {:ref "b" :type :database :name "ref:c"}
                {:ref "d" :type :database :name "db"}]
          ordered (import/order-representations reps)
          refs (mapv :ref ordered)]
      (is (= ["d" "c" "b" "a"] refs)))))
