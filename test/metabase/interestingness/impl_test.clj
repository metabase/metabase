(ns metabase.interestingness.impl-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.interestingness.impl :as impl]))

;;; -------------------------------------------------- type-penalty --------------------------------------------------

(deftest ^:parallel type-penalty-test
  (testing "penalized types score 0.0"
    (are [sem-type] (= 0.0 (impl/type-penalty {:semantic-type sem-type}))
      :type/PK
      :type/SerializedJSON
      :type/JSON
      :type/XML
      :type/Array
      :type/Dictionary
      :type/UpdatedTimestamp
      :type/DeletionTimestamp))
  (testing "non-penalized types score nil (no signal — neither penalty nor bonus)"
    (are [sem-type] (nil? (impl/type-penalty {:semantic-type sem-type}))
      :type/Category
      :type/Name
      :type/CreationTimestamp
      :type/Number
      :type/FK
      nil))
  (testing "nil semantic type scores nil (no signal)"
    (is (nil? (impl/type-penalty {})))))

;;; -------------------------------------------------- score-only composition --------------------------------------------------

(defn- constant-scorer [score]
  (fn [_field] score))

(deftest ^:parallel score-only-test
  (testing "single scorer"
    (is (= 0.8 (impl/score-only
                {(constant-scorer 0.8) 1.0}
                {:semantic-type :type/Category}))))
  (testing "weighted average of two scorers"
    (is (= 0.875 (impl/score-only
                  {(constant-scorer 1.0) 0.75
                   (constant-scorer 0.5) 0.25}
                  {}))))
  (testing "weights don't need to sum to 1"
    (is (= 0.875 (impl/score-only
                  {(constant-scorer 1.0) 3.0
                   (constant-scorer 0.5) 1.0}
                  {}))))
  (testing "hard-zero from any scorer forces total to 0.0"
    (is (= 0.0 (impl/score-only
                {(constant-scorer 1.0) 0.75
                 (constant-scorer 0.0) 0.25}
                {}))))
  (testing "empty scorer map returns 0.5 (neutral default)"
    (is (= 0.5 (impl/score-only {} {}))))
  (testing "nil-scoring scorers are excluded from both numerator and denominator"
    ;; only the real scorer participates: 1.0 * 0.30 / 0.30 = 1.0
    (is (= 1.0 (impl/score-only
                {(constant-scorer 1.0) 0.30
                 (constant-scorer nil) 0.70}
                {}))))
  (testing "all-nil scorers fall back to 0.5 neutral"
    ;; two distinct scorer instances so the map literal doesn't collapse to one key
    (let [s1 (constant-scorer nil)
          s2 (constant-scorer nil)]
      (is (= 0.5 (impl/score-only {s1 0.5 s2 0.5} {})))))
  (testing "nil score does not trip the hard-zero gate (would force 0.0)"
    (is (= 1.0 (impl/score-only
                {(constant-scorer 1.0) 0.5
                 (constant-scorer nil) 0.5}
                {})))))

;;; -------------------------------------------------- nullness --------------------------------------------------

(deftest ^:parallel nullness-test
  (testing "0% null scores 1.0"
    (is (= 1.0 (impl/nullness {:fingerprint {:global {:nil% 0.0}}}))))
  (testing "100% null scores 0.0"
    (is (= 0.0 (impl/nullness {:fingerprint {:global {:nil% 1.0}}}))))
  (testing "50% null scores 0.5"
    (is (= 0.5 (impl/nullness {:fingerprint {:global {:nil% 0.5}}}))))
  (testing "missing fingerprint returns nil (no signal)"
    (is (nil? (impl/nullness {})))))

;;; -------------------------------------------------- numeric-variance --------------------------------------------------

(deftest ^:parallel numeric-variance-test
  (testing "zero sd scores 0.0"
    (is (= 0.0 (impl/numeric-variance
                {:fingerprint {:type {:type/Number {:sd 0.0 :avg 10.0}}}}))))
  (testing "q1 = q3 scores low"
    (is (<= (impl/numeric-variance
             {:fingerprint {:type {:type/Number {:q1 5.0 :q3 5.0}}}})
            0.1)))
  (testing "healthy spread scores high"
    (is (> (impl/numeric-variance
            {:fingerprint {:type {:type/Number {:sd 10.0 :avg 50.0 :min 0 :max 100}}}})
           0.3)))
  (testing "non-numeric field returns nil (no signal)"
    (is (nil? (impl/numeric-variance {})))
    (is (nil? (impl/numeric-variance {:fingerprint {:type {:type/Text {}}}})))))

;;; -------------------------------------------------- distribution-shape --------------------------------------------------

(deftest ^:parallel distribution-shape-test
  (testing "no distribution data returns nil (no signal)"
    (is (nil? (impl/distribution-shape {})))
    (is (nil? (impl/distribution-shape
               {:fingerprint {:type {:type/Number {:avg 10 :sd 2}}}}))))
  (testing "symmetric low-dominance distribution scores high"
    (is (>= (impl/distribution-shape
             {:fingerprint {:type {:type/Number {:skewness 0.1 :mode-fraction 0.1}}}})
            0.9)))
  (testing "heavy skew penalizes score"
    (is (<= (impl/distribution-shape
             {:fingerprint {:type {:type/Number {:skewness 3.0 :mode-fraction 0.1}}}})
            0.5)))
  (testing "high mode-dominance scores very low"
    (is (<= (impl/distribution-shape
             {:fingerprint {:type {:type/Text {:mode-fraction 0.97}}}})
            0.1)))
  (testing "80% dominance scores low but not critical"
    (let [score (impl/distribution-shape
                 {:fingerprint {:type {:type/Text {:mode-fraction 0.85}}}})]
      (is (>= score 0.15))
      (is (<= score 0.3))))
  (testing "combined signals: worst-of-two wins"
    (is (<= (impl/distribution-shape
             {:fingerprint {:type {:type/Number {:skewness 0.1 :mode-fraction 0.95}}}})
            0.1)))
  (testing "works on text fields via type/Text fingerprint"
    (is (>= (impl/distribution-shape
             {:fingerprint {:type {:type/Text {:mode-fraction 0.3}}}})
            0.9)))
  (testing "extreme excess kurtosis penalizes score"
    (is (<= (impl/distribution-shape
             {:fingerprint {:type {:type/Number {:excess-kurtosis 20.0}}}})
            0.2)))
  (testing "near-normal kurtosis scores high"
    (is (>= (impl/distribution-shape
             {:fingerprint {:type {:type/Number {:excess-kurtosis 0.2}}}})
            0.9)))
  (testing "high top-3-fraction penalizes score"
    (is (<= (impl/distribution-shape
             {:fingerprint {:type {:type/Text {:mode-fraction 0.4 :top-3-fraction 0.995}}}})
            0.15)))
  (testing "high zero-fraction (numeric) penalizes score"
    (is (<= (impl/distribution-shape
             {:fingerprint {:type {:type/Number {:zero-fraction 0.96}}}})
            0.1)))
  (testing "temporal mode-fraction penalizes dumping-ground timestamps"
    (is (<= (impl/distribution-shape
             {:fingerprint {:type {:type/DateTime {:mode-fraction 0.95}}}})
            0.1))))
