(ns metabase.driver.common-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.models.setting :as setting]))

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

(defn- test-start-of-week-offset
  [db-start-of-week target-start-of-week]
  (with-redefs [driver/db-start-of-week (constantly db-start-of-week)
                setting/get-keyword     (constantly target-start-of-week)]
    (driver.common/start-of-week-offset :sql)))

(deftest start-of-week-offset-test
  (is (= 0 (test-start-of-week-offset :sunday :sunday)))
  (is (= -1 (test-start-of-week-offset :sunday :monday)))
  (is (= 1 (test-start-of-week-offset :monday :sunday)))
  (is (= 5 (test-start-of-week-offset :monday :wednesday))))
