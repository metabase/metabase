(ns metabase-enterprise.representations.import-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.import :as import]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest order-representations-self-reference-test
  (testing "order-representations throws exception when representation refers to itself"
    (let [reps [{:ref "a" :database "ref:a"}]
          result-future (future (try
                                  (import/order-representations reps)
                                  (catch Exception e e)))
          result (deref result-future 100 ::timeout)]
      (future-cancel result-future)
      (is (instance? Exception result)
          "Expected exception to be thrown")
      (is (not= ::timeout result) "order-representations took longer than 100ms, likely infinite loop"))))

(deftest order-representations-circular-reference-test
  (testing "order-representations throws exception when representations have circular dependency"
    (let [reps [{:ref "a" :database "ref:b"}
                {:ref "b" :database "ref:a"}]
          result-future (future (try
                                  (import/order-representations reps)
                                  (catch Exception e e)))
          result (deref result-future 100 ::timeout)]
      (future-cancel result-future)
      (is (instance? Exception result)
          "Expected exception to be thrown")
      (is (not= ::timeout result) "order-representations took longer than 100ms, likely infinite loop"))))

(deftest order-representations-empty-test
  (testing "order-representations handles empty list"
    (let [result-future (future (try
                                  (import/order-representations [])
                                  (catch Exception e e)))
          result (deref result-future 100 ::timeout)]
      (future-cancel result-future)
      (is (= [] result)))))

(deftest order-representations-chain-test
  (testing "order-representations orders chain correctly"
    (let [reps [{:ref "a" :type :question :database "ref:b"}
                {:ref "c" :type :model :database "ref:d"}
                {:ref "b" :type :database :name "ref:c"}
                {:ref "d" :type :database :name "db"}]
          result-future (future (try
                                  (import/order-representations reps)
                                  (catch Exception e e)))
          ordered (deref result-future 100 ::timeout)
          refs (mapv :ref ordered)]
      (future-cancel result-future)
      (is (= ["d" "c" "b" "a"] refs)))))
