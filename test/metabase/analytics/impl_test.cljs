(ns metabase.analytics.impl-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.analytics.impl :as impl]))

(deftest ^:parallel enqueue-test
  (testing "appends event when under capacity"
    (is (= {:events [{:a 1} {:b 2}] :dropped 0}
           (#'impl/enqueue {:events [{:a 1}] :dropped 0} {:b 2} 10))))
  (testing "drops the oldest event when adding at capacity"
    (is (= {:events [{:b 2} {:c 3}] :dropped 1}
           (#'impl/enqueue {:events [{:a 1} {:b 2}] :dropped 0} {:c 3} 2))))
  (testing "accumulates the dropped count across overflows"
    (is (= {:events [{:b 2} {:c 3}] :dropped 6}
           (#'impl/enqueue {:events [{:a 1} {:b 2}] :dropped 5} {:c 3} 2)))))

(deftest ^:parallel take-pending-test
  (testing "returns buffered events and resets the state"
    (is (= [[{:a 1} {:b 2}] {:events [] :dropped 0}]
           (#'impl/take-pending {:events [{:a 1} {:b 2}] :dropped 0}))))
  (testing "returns an empty payload when nothing is buffered and nothing was dropped"
    (is (= [[] {:events [] :dropped 0}]
           (#'impl/take-pending {:events [] :dropped 0}))))
  (testing "prepends a dropped-count :inc event when drops have occurred"
    (is (= [[{:op     :inc
              :metric :metabase-frontend/analytics-events-dropped
              :labels nil
              :amount 3}
             {:a 1}]
            {:events [] :dropped 0}]
           (#'impl/take-pending {:events [{:a 1}] :dropped 3}))))
  (testing "emits only the dropped-count event when the buffer is empty but drops occurred"
    (is (= [[{:op     :inc
              :metric :metabase-frontend/analytics-events-dropped
              :labels nil
              :amount 2}]
            {:events [] :dropped 0}]
           (#'impl/take-pending {:events [] :dropped 2})))))
