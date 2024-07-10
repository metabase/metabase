(ns metabase.util.concurrent-test
  (:require [clojure.test :refer [deftest is testing]]
            [metabase.util :as u]))

(set! *warn-on-reflection* true)

(deftest test-ecs-map
  (testing "Basic functionality"
    (is (= [1 2 3 4 5]
           (u/ecs-map inc [0 1 2 3 4]))))

  (testing "Order preservation"
    (is (= [0 1 2 3 4] (u/ecs-map identity [0 1 2 3 4]))))

  (testing "Handling of nil values"
    (is (= [2 nil 4 nil] (u/ecs-map #(when (odd? %) (inc %)) [1 2 3 4]))))

  (testing "Exception handling"
    (is (thrown-with-msg? Exception #"Divide by zero"
         (u/ecs-map #(/ 1 (- % 2)) [0 1 2 3 4]))))

  (testing "Parallel execution"
    (let [start-time (System/currentTimeMillis)
          _ (u/ecs-map #(do (Thread/sleep 100) %) (range 10))
          end-time (System/currentTimeMillis)
          duration (- end-time start-time)]
      (is (< duration 500) "Should take less than 500ms if executed in parallel")))

  (testing "Large collection handling"
    (is (= (range 1 100001) (u/ecs-map inc (range 100000))))))

(defn slow-inc [x] (Thread/sleep 100) (inc x))

(deftest test-concurrent-map-with-a-slow-function
  (testing "Handling of slow functions without timeout"
    (let [start-time (System/currentTimeMillis)
          result (u/ecs-map slow-inc (range 10))
          end-time (System/currentTimeMillis)
          duration (- end-time start-time)]
      (is (= (range 1 11) result))
      (is (< duration 1000) "Should take less than 1000ms if executed in parallel"))))
