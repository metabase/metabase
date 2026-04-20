(ns metabase.interestingness.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.interestingness.core :as interestingness]))

;;; Tests here cover only the public facade — the `compute interestingness for X`
;;; user-facing legos. The underlying composition machinery is tested in
;;; `metabase.interestingness.impl-test` and the scorers in
;;; `metabase.interestingness.dimension-test`.

(deftest ^:parallel dimension-interestingness-test
  (testing "scores a normalized field"
    (is (>= (interestingness/dimension-interestingness
             {:semantic-type :type/CreationTimestamp
              :base-type :type/DateTime
              :fingerprint {:global {:distinct-count 5000 :nil% 0.0}
                            :type {:type/DateTime {:earliest "2022-01-01"
                                                   :latest "2024-12-31"}}}})
            0.7)))

  (testing "accepts raw snake_case field maps"
    (is (<= (interestingness/dimension-interestingness
             {:semantic_type :type/PK
              :base_type :type/Integer
              :fingerprint {:global {:distinct-count 1000 :nil% 0.0}}})
            0.1))))

(deftest ^:parallel measure-interestingness-test
  (testing "rewards a clean numeric aggregation target"
    (is (>= (interestingness/measure-interestingness
             {:base_type :type/Float
              :fingerprint {:global {:distinct-count 5000 :nil% 0.05}
                            :type {:type/Number {:min 0 :max 1000 :sd 200 :avg 500
                                                 :skewness 0.2 :excess-kurtosis 0.5
                                                 :mode-fraction 0.05 :zero-fraction 0.02}}}})
            0.8)))

  (testing "FKs score below clean numerics (SUM/AVG are meaningless) but above PKs (COUNT DISTINCT is useful)"
    (is (< (interestingness/measure-interestingness
            {:semantic_type :type/FK
             :base_type :type/Integer
             :fingerprint {:global {:distinct-count 5000 :nil% 0.0}
                           :type {:type/Number {:min 1 :max 5000 :sd 1000 :avg 2500}}}})
           0.85)))

  (testing "dim and measure scores differ for FKs: good as dim (label substitution), weak as measure"
    (let [fk-field  {:semantic_type :type/FK :base_type :type/Integer
                     :fingerprint {:global {:distinct-count 5000 :nil% 0.0}
                                   :type {:type/Number {:min 1 :max 5000 :sd 1000 :avg 2500}}}}
          dim-score (interestingness/dimension-interestingness fk-field)
          msr-score (interestingness/measure-interestingness   fk-field)]
      (is (> dim-score msr-score)))))
