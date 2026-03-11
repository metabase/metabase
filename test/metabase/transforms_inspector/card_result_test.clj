(ns metabase.transforms-inspector.card-result-test
  (:require
   [clojure.test :refer :all]
   [metabase.transforms-inspector.card-result :as card-result]))

(deftest compute-card-result-default-test
  (testing "default method returns nil for non-nil rows"
    (is (nil? (card-result/compute-card-result :unknown-lens {:metadata {:card_type "something"}} [1 2 3]))))
  (testing "default method returns no_data for nil row"
    (is (= {"no_data" true}
           (card-result/compute-card-result :unknown-lens {:metadata {:card_type "something"}} nil)))))

(deftest compute-card-result-join-step-test
  (testing "join-analysis join_step computes null rate correctly"
    (let [card {:metadata {:card_type "join_step"}}]
      (testing "normal case: some unmatched rows"
        (is (= {"output_count"  100
                "matched_count" 80
                "null_count"    20
                "null_rate"     1/5}
               (card-result/compute-card-result :join-analysis card [100 80]))))
      (testing "all rows matched"
        (is (= {"output_count"  50
                "matched_count" 50
                "null_count"    0
                "null_rate"     0}
               (card-result/compute-card-result :join-analysis card [50 50]))))
      (testing "no rows matched"
        (is (= {"output_count"  100
                "matched_count" 0
                "null_count"    100
                "null_rate"     1}
               (card-result/compute-card-result :join-analysis card [100 0]))))
      (testing "zero output count avoids divide-by-zero"
        (is (= {"output_count"  0
                "matched_count" 0
                "null_count"    0
                "null_rate"     nil}
               (card-result/compute-card-result :join-analysis card [0 0]))))
      (testing "nil row returns no_data with zero counts"
        (is (= {"no_data"       true
                "output_count"  0
                "matched_count" 0
                "null_count"    0
                "null_rate"     nil}
               (card-result/compute-card-result :join-analysis card nil)))))))
