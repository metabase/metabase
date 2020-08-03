(ns metabase.driver.common-test
  (:require [clojure.test :refer :all]
            [metabase.driver.common :as driver.common]))

(deftest base-type-inference-test
  (is (= :type/Text
         (transduce identity (driver.common/values->base-type) ["A" "B" "C"])))
  (testing "should work with just one value"
    (is (= :type/Text
           (transduce identity (driver.common/values->base-type) ["A"]))))
  (testing "should work with just one value"
    (is (= :type/*
           (transduce identity (driver.common/values->base-type) []))))
  (testing "should work with a lot of values"
    (is (= :type/Integer
           (transduce identity (driver.common/values->base-type) (range 10000)))))
  (is (= :type/Text
         (transduce identity (driver.common/values->base-type) ["A" 100 "C"])))
  (is (= :type/*
         (transduce identity (driver.common/values->base-type) [(Object.)])))
  (testing "Base type inference should work with initial nils even if sequence is lazy"
    (let [realized-lazy-seq? (atom false)]
      (is (= [:type/Integer true]
             [(transduce identity (driver.common/values->base-type) (lazy-cat [nil nil nil]
                                                                            (do (reset! realized-lazy-seq? true)
                                                                                [4 5 6])))
              @realized-lazy-seq?]))))
  (testing "Base type inference should respect laziness and not keep scanning after it finds 100 values"
    (let [realized-lazy-seq? (atom false)]
      (is (= [:type/Integer true]
             [(transduce identity (driver.common/values->base-type) (lazy-cat [1 2 3]
                                                                            (repeat 1000 nil)
                                                                            (do (reset! realized-lazy-seq? true)
                                                                                [4 5 6])))
              @realized-lazy-seq?])))))
