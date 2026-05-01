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
  (testing "missing fingerprint returns nil (no signal)"
    (is (nil? (:score (dim/cardinality {}))))
    (is (nil? (:score (dim/cardinality {:fingerprint {}}))))))

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
  (testing "non-listed types score nil (no signal)"
    (doseq [sem-type [:type/Category :type/Name :type/Number :type/Text nil]]
      (is (nil? (:score (dim/type-bonus {:semantic-type sem-type})))
          (str sem-type " should score nil"))))
  (testing "base-type alone (no semantic-type) does not earn a bonus"
    (is (nil? (:score (dim/type-bonus {:base-type :type/DateTime}))))
    (is (nil? (:score (dim/type-bonus {:base-type :type/Boolean})))))
  (testing "no semantic type returns nil"
    (is (nil? (:score (dim/type-bonus {}))))))

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
  (testing "non-temporal field returns nil (no signal)"
    (is (nil? (:score (dim/temporal-range {})))))
  (testing "missing bounds returns nil (no signal)"
    (is (nil? (:score (dim/temporal-range
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
  (testing "non-text field returns nil (no signal)"
    (is (nil? (:score (dim/text-structure {}))))))

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

;;; -------------------------------------------------- dimension-interestingness --------------------------------------------------

(deftest ^:parallel dimension-interestingness-test
  (testing "PK with no fingerprint still scores 0.0 (hard-zero gate fires regardless of fingerprint)"
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/PK}))))
  (testing "PK with snake_case keys and no fingerprint scores 0.0"
    (is (= 0.0 (dim/dimension-interestingness {:semantic_type :type/PK}))))
  (testing "PK with a fingerprint also scores 0.0"
    (is (= 0.0 (dim/dimension-interestingness
                {:semantic-type :type/PK
                 :fingerprint   {:global {:distinct-count 1000 :nil% 0.0}}}))))
  (testing "structured-blob fields score 0.0 even with no fingerprint"
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/Collection})))
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/Structured}))))
  (testing "audit temporal subtypes score 0.0 (Updated/Deletion Date/Time, not just Timestamp)"
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/UpdatedTimestamp})))
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/UpdatedDate})))
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/UpdatedTime})))
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/DeletionTimestamp})))
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/DeletionDate})))
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/DeletionTime}))))
  (testing "non-hard-zero field with no fingerprint scores from the fingerprint-independent components only"
    (testing "plain category gets the type-penalty + type-bonus weighted average"
      (let [score (dim/dimension-interestingness {:semantic-type :type/Category})]
        (is (number? score))
        (is (pos? score))))
    (testing "field with no semantic type at all is treated as 'no penalty, no bonus'"
      (is (number? (dim/dimension-interestingness {})))
      (is (number? (dim/dimension-interestingness {:fingerprint nil}))))
    (testing "dimension-bonus semantic type scores higher than a plain field, both without fingerprint"
      (is (> (dim/dimension-interestingness {:semantic-type :type/Currency})
             (dim/dimension-interestingness {:semantic-type :type/Category})))))
  (testing "ordinary field with fingerprint returns a numeric score"
    (let [score (dim/dimension-interestingness
                 {:semantic-type :type/Category
                  :fingerprint   {:global {:distinct-count 15 :nil% 0.0}}})]
      (is (number? score))
      (is (pos? score)))))
