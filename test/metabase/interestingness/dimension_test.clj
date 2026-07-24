(ns metabase.interestingness.dimension-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.interestingness.dimension :as dim]))

;;; -------------------------------------------------- cardinality --------------------------------------------------

(deftest ^:parallel cardinality-test
  (testing "constant field (1 distinct) scores 0.0"
    (is (= 0.0 (:score (dim/cardinality {:fingerprint {:global {:distinct-count 1}}})))))
  (testing "low cardinality (10 = top of ramp to sweet spot) scores high"
    (let [score (:score (dim/cardinality {:fingerprint {:global {:distinct-count 10}}}))]
      (is (>= score 0.8))))
  (testing "moderate cardinality (50 = past sweet spot, declining) scores moderately"
    (let [score (:score (dim/cardinality {:fingerprint {:global {:distinct-count 50}}}))]
      (is (>= score 0.7))))
  (testing "high cardinality scores lower"
    (let [score (:score (dim/cardinality {:fingerprint {:global {:distinct-count 5000}}}))]
      (is (< score 0.5))))
  (testing "missing fingerprint returns 0.5"
    (is (= 0.5 (:score (dim/cardinality {}))))
    (is (= 0.5 (:score (dim/cardinality {:fingerprint {}}))))))

;;; -------------------------------------------------- type-bonus --------------------------------------------------

(deftest ^:parallel type-bonus-test
  (testing "listed bonus types score 1.0"
    (doseq [sem-type [:type/CreationTimestamp
                      :type/Country     ; via :type/Address
                      :type/ZipCode     ; via :type/Address
                      :type/Income      ; via :type/Currency
                      :type/Price       ; via :type/Currency
                      :type/Birthdate
                      :type/Title
                      :type/Quantity
                      :type/Share
                      :type/Score
                      :type/JoinDate    ; via :type/JoinTemporal
                      :type/CancelationTimestamp ; via :type/CancelationTemporal
                      :type/Company
                      :type/Subscription
                      :type/Owner]]
      (is (= 1.0 (:score (dim/type-bonus {:semantic-type sem-type})))
          (str sem-type " should score 1.0"))))
  (testing "non-listed types score 0.5"
    (doseq [sem-type [:type/Category :type/Name :type/Number :type/Text nil]]
      (is (= 0.5 (:score (dim/type-bonus {:semantic-type sem-type})))
          (str sem-type " should score 0.5"))))
  (testing "base-type alone (no semantic-type) does not earn a bonus"
    (is (= 0.5 (:score (dim/type-bonus {:base-type :type/DateTime}))))
    (is (= 0.5 (:score (dim/type-bonus {:base-type :type/Boolean})))))
  (testing "no semantic type returns 0.5"
    (is (= 0.5 (:score (dim/type-bonus {}))))))

;;; -------------------------------------------------- temporal-range --------------------------------------------------

(deftest ^:parallel temporal-range-test
  (testing "multi-year range scores high"
    (let [score (:score (dim/temporal-range
                         {:fingerprint {:type {:type/DateTime {:earliest "2020-01-01" :latest "2024-01-01"}}}}))]
      (is (>= score 0.9))))
  (testing "same-day range scores low"
    (let [score (:score (dim/temporal-range
                         {:fingerprint {:type {:type/DateTime {:earliest "2024-01-01" :latest "2024-01-01"}}}}))]
      (is (<= score 0.2))))
  (testing "short range (few days) scores moderate"
    (let [score (:score (dim/temporal-range
                         {:fingerprint {:type {:type/DateTime {:earliest "2024-01-01" :latest "2024-01-10"}}}}))]
      (is (> score 0.3))
      (is (< score 0.7))))
  (testing "non-temporal field returns 0.5"
    (is (= 0.5 (:score (dim/temporal-range {})))))
  (testing "missing bounds returns 0.5"
    (is (= 0.5 (:score (dim/temporal-range
                        {:fingerprint {:type {:type/DateTime {:earliest nil :latest nil}}}}))))))

;;; -------------------------------------------------- text-structure --------------------------------------------------

(deftest ^:parallel text-structure-test
  (testing "high JSON percentage scores low"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:percent-json 0.95}}}}))]
      (is (<= score 0.15))))
  (testing "high URL percentage scores low"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:percent-url 0.95}}}}))]
      (is (<= score 0.2))))
  (testing "long average length scores low"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:average-length 150}}}}))]
      (is (<= score 0.25))))
  (testing "moderate length scores low (soft penalty)"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:average-length 60}}}}))]
      (is (> score 0.1))
      (is (< score 0.3))))
  (testing "very long text (> 100 chars) scores near-zero but isn't a hard-zero"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:average-length 200}}}}))]
      (is (< score 0.1))
      (is (> score 0.0))))
  (testing "short text scores high"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:average-length 10}}}}))]
      (is (>= score 0.7))))
  (testing "high email percentage scores low (PII safety net for missed classifier)"
    (let [result (dim/text-structure
                  {:fingerprint {:type {:type/Text {:percent-email 0.95}}}})]
      (is (<= (:score result) 0.2))
      (is (re-find #"email" (:reason result)))))
  (testing "high state percentage is flagged (suggests map viz, not breakout)"
    (let [result (dim/text-structure
                  {:fingerprint {:type {:type/Text {:percent-state 0.95}}}})]
      (is (<= (:score result) 0.4))
      (is (re-find #"state" (:reason result)))))
  (testing "non-text field returns 0.5"
    (is (= 0.5 (:score (dim/text-structure {}))))))

;;; -------------------------------------------------- text-structure percent-blank --------------------------------------------------

(deftest ^:parallel text-structure-blank-test
  (testing "mostly-blank text scores very low"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:percent-blank 0.9}}}}))]
      (is (<= score 0.15))))
  (testing "low percent-blank doesn't trigger the penalty"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:percent-blank 0.1 :average-length 10}}}}))]
      (is (>= score 0.7)))))

;;; -------------------------------------------------- usage --------------------------------------------------

(deftest ^:parallel usage-test
  (testing "no usage data returns neutral 0.5"
    (is (= 0.5 (:score (dim/usage {}))))
    (is (= 0.5 (:score (dim/usage {:usage {}})))))
  (testing "field never broken out returns neutral 0.5"
    (is (= 0.5 (:score (dim/usage {:usage {:breakout-count 0 :baseline-breakout-count 1000}})))))
  (testing "no instance baseline to scale against returns neutral 0.5"
    (is (= 0.5 (:score (dim/usage {:usage {:breakout-count 50}}))))
    (is (= 0.5 (:score (dim/usage {:usage {:breakout-count 50 :baseline-breakout-count 0}})))))
  (testing "a dimension at the p95 baseline scores 1.0"
    (is (= 1.0 (:score (dim/usage {:usage {:breakout-count 5000 :baseline-breakout-count 5000}})))))
  (testing "a dimension above the p95 baseline (top ~5%) is clamped to 1.0"
    (is (= 1.0 (:score (dim/usage {:usage {:breakout-count 50000 :baseline-breakout-count 5000}})))))
  (testing "a less-used dimension scores between neutral and the baseline"
    (let [score (:score (dim/usage {:usage {:breakout-count 50 :baseline-breakout-count 100000}}))]
      (is (< 0.5 score 1.0))))
  (testing "score is monotonic in usage for a fixed baseline"
    (let [base 100000
          s1   (:score (dim/usage {:usage {:breakout-count 1 :baseline-breakout-count base}}))
          s100 (:score (dim/usage {:usage {:breakout-count 100 :baseline-breakout-count base}}))
          s10k (:score (dim/usage {:usage {:breakout-count 10000 :baseline-breakout-count base}}))]
      (is (< s1 s100 s10k))))
  (testing "self-calibrating: the same raw count scores higher on a quieter instance"
    (let [busy  (:score (dim/usage {:usage {:breakout-count 500 :baseline-breakout-count 1000000}}))
          quiet (:score (dim/usage {:usage {:breakout-count 500 :baseline-breakout-count 1000}}))]
      (is (< busy quiet)))))
