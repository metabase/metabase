(ns metabase.query-processor.store-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.store :as qp.store]))

(deftest cached-test
  (testing "make sure `cached` only evaluates its body once during the duration of a QP run"
    (let [eval-count   (atom 0)
          cached-value (fn []
                         (qp.store/cached :value
                                          (swap! eval-count inc)
                                          :ok))]
      (qp.store/with-store
        (cached-value)
        (cached-value)
        (is (= {:value :ok, :eval-count 1}
               {:value      (cached-value)
                :eval-count @eval-count}))))))

(deftest reuse-existing-store-test
  (testing "multiple calls to `with-store` should keep the existing store if one is already established"
    (let [eval-count   (atom 0)
          cached-value (fn []
                         (qp.store/cached :value
                                          (swap! eval-count inc)
                                          :ok))]
      (qp.store/with-store
        (cached-value)
        (qp.store/with-store
          (cached-value)
          (is (= {:value :ok, :eval-count 1}
                 (qp.store/with-store
                   {:value      (cached-value)
                    :eval-count @eval-count}))))))))

(deftest caching-unique-key-test
  (testing "caching should be unique for each key"
    (let [eval-count   (atom 0)
          cached-value (fn [x]
                         (qp.store/cached x
                                          (swap! eval-count inc)
                                          x))]
      (qp.store/with-store
        (cached-value :a)
        (cached-value :b)
        (is (= {:a :a, :b :b, :eval-count 2}
               {:a          (cached-value :a)
                :b          (cached-value :b)
                :eval-count @eval-count}))))))
