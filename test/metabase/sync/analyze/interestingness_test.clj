(ns metabase.sync.analyze.interestingness-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.interestingness.core :as interestingness]))

;;; Smoke tests for the canonical weight profiles. The sync step itself is verified
;;; end-to-end via `automagic_dashboards` integration tests (which fingerprint + score
;;; real tables). Here we just pin down the profile shape and directional behavior.

(deftest ^:parallel canonical-dimension-weights-test
  (testing "canonical-dimension-weights includes expected scorers"
    (is (map? interestingness/canonical-dimension-weights))
    (is (every? fn? (keys interestingness/canonical-dimension-weights)))
    (is (every? pos? (vals interestingness/canonical-dimension-weights))))

  (testing "canonical-dimension-weights kills PKs"
    (let [result (interestingness/score-raw-field
                  interestingness/canonical-dimension-weights
                  {:semantic_type :type/PK
                   :base_type :type/Integer
                   :fingerprint {:global {:distinct-count 1000 :nil% 0.0}}})]
      (is (<= (:score result) 0.1))))

  (testing "canonical-dimension-weights rewards a good temporal breakout column"
    (let [result (interestingness/score-raw-field
                  interestingness/canonical-dimension-weights
                  {:semantic_type :type/CreationTimestamp
                   :base_type :type/DateTime
                   :fingerprint {:global {:distinct-count 5000 :nil% 0.0}
                                 :type {:type/DateTime {:earliest "2022-01-01"
                                                        :latest "2024-12-31"}}}})]
      (is (>= (:score result) 0.7)))))

(deftest ^:parallel canonical-measure-weights-test
  ;; `canonical-measure-weights` is defined for future use (measure-role scoring) but the
  ;; current sync pipeline persists only `dimension_interestingness`. Validate the profile
  ;; produces sensible directional scores so it's ready when a consumer needs it.

  (testing "canonical-measure-weights includes expected scorers"
    (is (map? interestingness/canonical-measure-weights))
    (is (every? fn? (keys interestingness/canonical-measure-weights)))
    (is (every? pos? (vals interestingness/canonical-measure-weights))))

  (testing "canonical-measure-weights kills PKs"
    (let [result (interestingness/score-raw-field
                  interestingness/canonical-measure-weights
                  {:semantic_type :type/PK
                   :base_type :type/Integer
                   :fingerprint {:global {:distinct-count 1000 :nil% 0.0}}})]
      (is (<= (:score result) 0.1))))

  (testing "canonical-measure-weights penalizes FKs (aggregating row IDs is meaningless)"
    (let [result (interestingness/score-raw-field
                  interestingness/canonical-measure-weights
                  {:semantic_type :type/FK
                   :base_type :type/Integer
                   :fingerprint {:global {:distinct-count 5000 :nil% 0.0}
                                 :type {:type/Number {:min 1 :max 5000 :sd 1000 :avg 2500}}}})]
      (is (< (:score result) 0.7))))

  (testing "canonical-measure-weights rewards a clean numeric aggregation target"
    (let [result (interestingness/score-raw-field
                  interestingness/canonical-measure-weights
                  {:base_type :type/Float
                   :fingerprint {:global {:distinct-count 5000 :nil% 0.05}
                                 :type {:type/Number {:min 0 :max 1000 :sd 200 :avg 500
                                                      :skewness 0.2 :excess-kurtosis 0.5
                                                      :mode-fraction 0.05 :zero-fraction 0.02}}}})]
      (is (>= (:score result) 0.8))))

  (testing "canonical-measure-weights: text scores lower than numeric"
    (let [text-field {:base_type :type/Text
                      :fingerprint {:global {:distinct-count 100 :nil% 0.0}
                                    :type {:type/Text {:average-length 10 :mode-fraction 0.05}}}}
          num-field  {:base_type :type/Float
                      :fingerprint {:global {:distinct-count 5000 :nil% 0.05}
                                    :type {:type/Number {:min 0 :max 1000 :sd 200 :avg 500
                                                         :skewness 0.2 :excess-kurtosis 0.5
                                                         :mode-fraction 0.05 :zero-fraction 0.02}}}}
          text-score (:score (interestingness/score-raw-field
                              interestingness/canonical-measure-weights text-field))
          num-score  (:score (interestingness/score-raw-field
                              interestingness/canonical-measure-weights num-field))]
      (is (< text-score num-score))))

  (testing "dim and measure scores can differ substantially for the same field"
    (let [fk-field   {:semantic_type :type/FK :base_type :type/Integer
                      :fingerprint {:global {:distinct-count 5000 :nil% 0.0}
                                    :type {:type/Number {:min 1 :max 5000 :sd 1000 :avg 2500}}}}
          dim-score  (:score (interestingness/score-raw-field
                              interestingness/canonical-dimension-weights fk-field))
          msr-score  (:score (interestingness/score-raw-field
                              interestingness/canonical-measure-weights fk-field))]
      (is (> dim-score msr-score))
      (testing "FK: good as dim (label substitution), bad as measure"
        (is (>= dim-score 0.5))
        (is (<= msr-score 0.7))))))
