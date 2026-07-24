(ns metabase-enterprise.osi-generation.metrics-test
  "The Prometheus call layer. Capture the analytics-interface calls and assert the metric
  keyword and bounded label map each emitter produces."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.osi-generation.metrics :as metrics]
   [metabase.analytics-interface.core :as analytics]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest candidate-and-error-counters-use-bounded-labels-test
  (let [events (atom [])]
    (mt/with-dynamic-fn-redefs [analytics/inc! (fn [& args] (swap! events conj (vec args)))]
      (metrics/record-candidate! :table :generated)
      (metrics/record-error! :run-failed))
    (is (= [[:metabase-osi-generation/candidates-processed {:entity-type :table, :outcome :generated}]
            [:metabase-osi-generation/run-errors {:error-type :run-failed}]]
           @events))))

(deftest completed-run-emits-duration-tokens-and-backlog-test
  (let [events (atom [])]
    (mt/with-dynamic-fn-redefs [analytics/observe!   (fn [& args] (swap! events conj (into [:observe] args)))
                                analytics/set-gauge! (fn [& args] (swap! events conj (into [:gauge] args)))
                                analytics/inc!       (fn [& args] (swap! events conj (into [:inc] args)))]
      (metrics/record-run! {:duration-ms 12, :input-tokens 20, :output-tokens 4} 7))
    (is (= [[:observe :metabase-osi-generation/run-duration-ms {:outcome "completed"} 12]
            [:observe :metabase-osi-generation/tokens-per-run {:kind "input"} 20]
            [:observe :metabase-osi-generation/tokens-per-run {:kind "output"} 4]
            [:gauge :metabase-osi-generation/candidates-pending nil 7]]
           @events))))

(deftest capped-run-increments-budget-counter-test
  (testing ":stopped-by names the bound dimension as the budget-exhausted{limit=...} label"
    (let [increments (atom [])]
      (mt/with-dynamic-fn-redefs [analytics/observe!   (fn [& _])
                                  analytics/set-gauge! (fn [& _])
                                  analytics/inc!       (fn [& args] (swap! increments conj (vec args)))]
        (metrics/record-run! {:stopped-by :tokens} 1))
      (is (= [[:metabase-osi-generation/budget-exhausted {:limit :tokens}]] @increments)))))

(deftest blocked-before-selection-preserves-backlog-gauge-test
  (testing "nil pending means unknown, so a quota-blocked run does not replace the prior gauge with zero"
    (let [gauges (atom [])]
      (mt/with-dynamic-fn-redefs [analytics/observe!   (fn [& _])
                                  analytics/set-gauge! (fn [& args] (swap! gauges conj args))
                                  analytics/inc!       (fn [& _])]
        (metrics/record-run! {:stopped-by :hour} nil))
      (is (empty? @gauges)))))
