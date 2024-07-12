(ns metabase.util.concurrent-test
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.test.check.clojure-test :as ct :refer [defspec]]
            [clojure.test.check.properties :as prop :refer [for-all]]
            [malli.generator :as mg]
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
      (is (< duration 500) "Should take less than 500ms if executed in parallel"))))

(defn slow-inc [x] (Thread/sleep 100) (inc x))

(deftest test-concurrent-map-with-a-slow-function
  (testing "Handling of slow functions without timeout"
    (let [start-time (System/currentTimeMillis)
          result     (u/ecs-map slow-inc (range 10))
          end-time   (System/currentTimeMillis)
          duration   (- end-time start-time)]
      (is (= (range 1 11) result))
      (is (< duration 1000) "Should take less than 1000ms if executed in parallel")))
  (testing "Handling of slow functions with timeout"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Timeout exceeded while waiting for tasks to complete"
                          (u/ecs-map slow-inc (range 10) :timeout 1))
        "Should throw an exception if the timeout is exceeded")))

(deftest timeout-interrupts-processing-on-time
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Timeout exceeded while waiting for tasks to complete"
                        (u/ecs-map
                         (fn super-slow-fn [x] (Thread/sleep 10000) (inc x))
                         (range 10)
                         :timeout 500))))

(defspec concurrent-map-values-returns-same-number-of-items 100
  (for-all [coll (mg/generator [:sequential :any])]
           (let [result (u/ecs-map identity coll)]
             (= (count coll) (count result)))))

(defspec concurrent-map-values-return-in-order 100
  (for-all [coll (mg/generator [:sequential :any])]
           (let [result (u/ecs-map identity coll)]
             (= coll result))))

(defspec concurrent-map-values-are-processed-in-parallel 100
  (for-all [coll (mg/generator [:sequential {:min 10 :max 15} :any])
            sleep-time (mg/generator [:int {:min 5 :max 10}])]
           (let [sync-time (* sleep-time (count coll))
                 start-time (System/currentTimeMillis)
                 _run_it-> (u/ecs-map #(do (Thread/sleep ^Long sleep-time) %) coll)
                 end-time (System/currentTimeMillis)
                 duration (- end-time start-time)]
             ;; it's ~10x faster, depending on how many processors are on the machine, but this won't flake and will
             ;; test it properly:
             (<= duration (dec sync-time)))))
;; TODO:
(defspec timeout-is-respected 100
  (for-all [coll (mg/generator [:sequential {:min 10 :max 15} :any])
            sleep-time (mg/generator [:int {:min 10 :max 20}])]
           (try (u/ecs-map #(do (Thread/sleep ^Long sleep-time) %) coll :timeout 1)
                (catch clojure.lang.ExceptionInfo e
                  (re-find #"Timeout exceeded while waiting for tasks to complete"
                           (.getMessage e))))))
