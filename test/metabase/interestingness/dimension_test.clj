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
  (testing "score ordering: creation > temporal > geo > category > boolean > generic"
    (let [creation (dim/type-bonus {:semantic-type :type/CreationTimestamp})
          temporal (dim/type-bonus {:semantic-type :type/DateTime
                                    :base-type    :type/DateTime})
          geo      (dim/type-bonus {:semantic-type :type/Country})
          category (dim/type-bonus {:semantic-type :type/Category})
          boolean  (dim/type-bonus {:base-type :type/Boolean})
          generic  (dim/type-bonus {:semantic-type :type/Number})]
      (is (> (:score creation) (:score temporal)))
      (is (> (:score temporal) (:score geo)))
      (is (> (:score geo) (:score category)))
      (is (> (:score category) (:score boolean)))
      (is (> (:score boolean) (:score generic)))))

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
