(ns metabase.interestingness.scorers.dimension-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.interestingness.scorers.dimension :as dim]))

;;; -------------------------------------------------- type-penalty --------------------------------------------------

(deftest ^:parallel type-penalty-test
  (testing "penalized types score 0.0"
    (are [sem-type reason-substr]
         (let [{:keys [score reason]} (dim/type-penalty {:semantic-type sem-type} nil)]
           (and (= 0.0 score) (re-find (re-pattern reason-substr) reason)))
      :type/PK                "primary key"
      :type/SerializedJSON    "serialized JSON"
      :type/UpdatedTimestamp  "updated timestamp"
      :type/DeletionTimestamp "deletion timestamp"))

  (testing "non-penalized types score 1.0 (including FK — x-ray templates use FK columns)"
    (are [sem-type]
         (= 1.0 (:score (dim/type-penalty {:semantic-type sem-type} nil)))
      :type/Category
      :type/Name
      :type/CreationTimestamp
      :type/Number
      :type/FK
      nil))

  (testing "nil semantic type scores 1.0"
    (is (= 1.0 (:score (dim/type-penalty {} nil)))))

  (testing "context is ignored"
    (is (= (:score (dim/type-penalty {:semantic-type :type/PK} nil))
           (:score (dim/type-penalty {:semantic-type :type/PK} {:intent :revenue}))))))

;;; -------------------------------------------------- cardinality --------------------------------------------------

(deftest ^:parallel cardinality-test
  (testing "constant field (1 distinct) scores 0.0"
    (is (= 0.0 (:score (dim/cardinality {:fingerprint {:global {:distinct-count 1}}} nil)))))

  (testing "low cardinality (10 = top of ramp to sweet spot) scores high"
    (let [score (:score (dim/cardinality {:fingerprint {:global {:distinct-count 10}}} nil))]
      (is (>= score 0.8))))

  (testing "moderate cardinality (50 = past sweet spot, declining) scores moderately"
    (let [score (:score (dim/cardinality {:fingerprint {:global {:distinct-count 50}}} nil))]
      (is (>= score 0.7))))

  (testing "high cardinality scores lower"
    (let [score (:score (dim/cardinality {:fingerprint {:global {:distinct-count 5000}}} nil))]
      (is (< score 0.5))))

  (testing "missing fingerprint returns 0.5"
    (is (= 0.5 (:score (dim/cardinality {} nil))))
    (is (= 0.5 (:score (dim/cardinality {:fingerprint {}} nil)))))

  (testing "context is ignored"
    (is (= (:score (dim/cardinality {:fingerprint {:global {:distinct-count 10}}} nil))
           (:score (dim/cardinality {:fingerprint {:global {:distinct-count 10}}} {}))))))

;;; -------------------------------------------------- nullness --------------------------------------------------

(deftest ^:parallel nullness-test
  (testing "0% null scores 1.0"
    (is (= 1.0 (:score (dim/nullness {:fingerprint {:global {:nil% 0.0}}} nil)))))

  (testing "100% null scores 0.0"
    (is (= 0.0 (:score (dim/nullness {:fingerprint {:global {:nil% 1.0}}} nil)))))

  (testing "50% null scores 0.5"
    (is (= 0.5 (:score (dim/nullness {:fingerprint {:global {:nil% 0.5}}} nil)))))

  (testing "missing fingerprint returns 0.5"
    (is (= 0.5 (:score (dim/nullness {} nil)))))

  (testing "context is ignored"
    (is (= (:score (dim/nullness {:fingerprint {:global {:nil% 0.3}}} nil))
           (:score (dim/nullness {:fingerprint {:global {:nil% 0.3}}} {:intent :x}))))))

;;; -------------------------------------------------- measure-type-suitability --------------------------------------------------

(deftest ^:parallel measure-type-suitability-test
  (testing "PK and FK are strongly penalized as measures — aggregating row IDs is meaningless"
    (is (<= (:score (dim/measure-type-suitability {:base-type :type/Integer :semantic-type :type/PK} nil)) 0.1))
    (is (<= (:score (dim/measure-type-suitability {:base-type :type/Integer :semantic-type :type/FK} nil)) 0.1)))

  (testing "numeric types score 1.0"
    (is (= 1.0 (:score (dim/measure-type-suitability {:base-type :type/Integer} nil))))
    (is (= 1.0 (:score (dim/measure-type-suitability {:base-type :type/Float} nil))))
    (is (= 1.0 (:score (dim/measure-type-suitability {:base-type :type/Decimal} nil)))))

  (testing "effective-type wins over base-type"
    (is (= 1.0 (:score (dim/measure-type-suitability
                        {:base-type :type/Text :effective-type :type/Integer}
                        nil)))))

  (testing "boolean scores ~0.6 (COUNT and SUM 0/1 work)"
    (let [s (:score (dim/measure-type-suitability {:base-type :type/Boolean} nil))]
      (is (> s 0.5))
      (is (< s 0.8))))

  (testing "text scores low (only COUNT/COUNT DISTINCT)"
    (is (< (:score (dim/measure-type-suitability {:base-type :type/Text} nil)) 0.5)))

  (testing "temporal scores low (only MIN/MAX)"
    (is (< (:score (dim/measure-type-suitability {:base-type :type/DateTime} nil)) 0.4)))

  (testing "unknown types score 0.1"
    (is (= 0.1 (:score (dim/measure-type-suitability {:base-type :type/*} nil))))))

;;; -------------------------------------------------- type-bonus --------------------------------------------------

(deftest ^:parallel type-bonus-test
  (testing "score ordering: creation > temporal > geo > category > boolean > generic"
    (let [creation (dim/type-bonus {:semantic-type :type/CreationTimestamp} nil)
          temporal (dim/type-bonus {:semantic-type :type/DateTime
                                    :base-type    :type/DateTime} nil)
          geo      (dim/type-bonus {:semantic-type :type/Country} nil)
          category (dim/type-bonus {:semantic-type :type/Category} nil)
          boolean  (dim/type-bonus {:base-type :type/Boolean} nil)
          generic  (dim/type-bonus {:semantic-type :type/Number} nil)]
      (is (> (:score creation) (:score temporal)))
      (is (> (:score temporal) (:score geo)))
      (is (> (:score geo) (:score category)))
      (is (> (:score category) (:score boolean)))
      (is (> (:score boolean) (:score generic)))))

  (testing "no semantic type returns 0.5"
    (is (= 0.5 (:score (dim/type-bonus {} nil)))))

  (testing "context is ignored"
    (is (= (:score (dim/type-bonus {:semantic-type :type/Category} nil))
           (:score (dim/type-bonus {:semantic-type :type/Category} {:intent :x}))))))

;;; -------------------------------------------------- numeric-variance --------------------------------------------------

(deftest ^:parallel numeric-variance-test
  (testing "zero sd scores 0.0"
    (is (= 0.0 (:score (dim/numeric-variance
                        {:fingerprint {:type {:type/Number {:sd 0.0 :avg 10.0}}}}
                        nil)))))

  (testing "q1 = q3 scores low"
    (is (<= (:score (dim/numeric-variance
                     {:fingerprint {:type {:type/Number {:q1 5.0 :q3 5.0}}}}
                     nil))
            0.1)))

  (testing "healthy spread scores high"
    (let [score (:score (dim/numeric-variance
                         {:fingerprint {:type {:type/Number {:sd 10.0 :avg 50.0 :min 0 :max 100}}}}
                         nil))]
      (is (> score 0.3))))

  (testing "non-numeric field returns 0.5"
    (is (= 0.5 (:score (dim/numeric-variance {} nil))))
    (is (= 0.5 (:score (dim/numeric-variance {:fingerprint {:type {:type/Text {}}}} nil)))))

  (testing "context is ignored"
    (is (= (:score (dim/numeric-variance {:fingerprint {:type {:type/Number {:sd 5.0 :avg 10.0}}}} nil))
           (:score (dim/numeric-variance {:fingerprint {:type {:type/Number {:sd 5.0 :avg 10.0}}}} {}))))))

;;; -------------------------------------------------- temporal-range --------------------------------------------------

(deftest ^:parallel temporal-range-test
  (testing "multi-year range scores high"
    (let [score (:score (dim/temporal-range
                         {:fingerprint {:type {:type/DateTime {:earliest "2020-01-01" :latest "2024-01-01"}}}}
                         nil))]
      (is (>= score 0.9))))

  (testing "same-day range scores low"
    (let [score (:score (dim/temporal-range
                         {:fingerprint {:type {:type/DateTime {:earliest "2024-01-01" :latest "2024-01-01"}}}}
                         nil))]
      (is (<= score 0.2))))

  (testing "short range (few days) scores moderate"
    (let [score (:score (dim/temporal-range
                         {:fingerprint {:type {:type/DateTime {:earliest "2024-01-01" :latest "2024-01-10"}}}}
                         nil))]
      (is (> score 0.3))
      (is (< score 0.7))))

  (testing "non-temporal field returns 0.5"
    (is (= 0.5 (:score (dim/temporal-range {} nil)))))

  (testing "missing bounds returns 0.5"
    (is (= 0.5 (:score (dim/temporal-range
                        {:fingerprint {:type {:type/DateTime {:earliest nil :latest nil}}}}
                        nil)))))

  (testing "context is ignored"
    (is (= (:score (dim/temporal-range
                    {:fingerprint {:type {:type/DateTime {:earliest "2020-01-01" :latest "2024-01-01"}}}}
                    nil))
           (:score (dim/temporal-range
                    {:fingerprint {:type {:type/DateTime {:earliest "2020-01-01" :latest "2024-01-01"}}}}
                    {}))))))

;;; -------------------------------------------------- text-structure --------------------------------------------------

(deftest ^:parallel text-structure-test
  (testing "high JSON percentage scores low"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:percent-json 0.95}}}}
                         nil))]
      (is (<= score 0.15))))

  (testing "high URL percentage scores low"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:percent-url 0.95}}}}
                         nil))]
      (is (<= score 0.2))))

  (testing "long average length scores low"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:average-length 150}}}}
                         nil))]
      (is (<= score 0.25))))

  (testing "moderate length scores moderate"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:average-length 60}}}}
                         nil))]
      (is (> score 0.3))
      (is (< score 0.5))))

  (testing "short text scores high"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:average-length 10}}}}
                         nil))]
      (is (>= score 0.7))))

  (testing "high email percentage scores low (PII safety net for missed classifier)"
    (let [result (dim/text-structure
                  {:fingerprint {:type {:type/Text {:percent-email 0.95}}}}
                  nil)]
      (is (<= (:score result) 0.2))
      (is (re-find #"email" (:reason result)))))

  (testing "high state percentage is flagged (suggests map viz, not breakout)"
    (let [result (dim/text-structure
                  {:fingerprint {:type {:type/Text {:percent-state 0.95}}}}
                  nil)]
      (is (<= (:score result) 0.4))
      (is (re-find #"state" (:reason result)))))

  (testing "non-text field returns 0.5"
    (is (= 0.5 (:score (dim/text-structure {} nil)))))

  (testing "context is ignored"
    (is (= (:score (dim/text-structure
                    {:fingerprint {:type {:type/Text {:percent-json 0.5}}}}
                    nil))
           (:score (dim/text-structure
                    {:fingerprint {:type {:type/Text {:percent-json 0.5}}}}
                    {}))))))

;;; -------------------------------------------------- distribution-shape --------------------------------------------------

(deftest ^:parallel distribution-shape-test
  (testing "no distribution data returns 0.5"
    (is (= 0.5 (:score (dim/distribution-shape {} nil))))
    (is (= 0.5 (:score (dim/distribution-shape
                        {:fingerprint {:type {:type/Number {:avg 10 :sd 2}}}}
                        nil)))))

  (testing "symmetric low-dominance distribution scores high"
    (let [score (:score (dim/distribution-shape
                         {:fingerprint {:type {:type/Number {:skewness 0.1 :mode-fraction 0.1}}}}
                         nil))]
      (is (>= score 0.9))))

  (testing "heavy skew penalizes score"
    (let [score (:score (dim/distribution-shape
                         {:fingerprint {:type {:type/Number {:skewness 3.0 :mode-fraction 0.1}}}}
                         nil))]
      (is (<= score 0.5))))

  (testing "high mode-dominance scores very low"
    (let [score (:score (dim/distribution-shape
                         {:fingerprint {:type {:type/Text {:mode-fraction 0.97}}}}
                         nil))]
      (is (<= score 0.1))))

  (testing "80% dominance scores low but not critical"
    (let [score (:score (dim/distribution-shape
                         {:fingerprint {:type {:type/Text {:mode-fraction 0.85}}}}
                         nil))]
      (is (>= score 0.15))
      (is (<= score 0.3))))

  (testing "combined signals: worst-of-two wins"
    (let [score (:score (dim/distribution-shape
                         {:fingerprint {:type {:type/Number {:skewness 0.1 :mode-fraction 0.95}}}}
                         nil))]
      (is (<= score 0.1))))

  (testing "works on text fields via type/Text fingerprint"
    (let [score (:score (dim/distribution-shape
                         {:fingerprint {:type {:type/Text {:mode-fraction 0.3}}}}
                         nil))]
      (is (>= score 0.9))))

  (testing "context is ignored"
    (is (= (:score (dim/distribution-shape
                    {:fingerprint {:type {:type/Text {:mode-fraction 0.5}}}}
                    nil))
           (:score (dim/distribution-shape
                    {:fingerprint {:type {:type/Text {:mode-fraction 0.5}}}}
                    {:intent :x})))))

  (testing "extreme excess kurtosis penalizes score"
    (let [score (:score (dim/distribution-shape
                         {:fingerprint {:type {:type/Number {:excess-kurtosis 20.0}}}}
                         nil))]
      (is (<= score 0.2))))

  (testing "near-normal kurtosis scores high"
    (let [score (:score (dim/distribution-shape
                         {:fingerprint {:type {:type/Number {:excess-kurtosis 0.2}}}}
                         nil))]
      (is (>= score 0.9))))

  (testing "high top-3-fraction penalizes score"
    (let [score (:score (dim/distribution-shape
                         {:fingerprint {:type {:type/Text {:mode-fraction 0.4 :top-3-fraction 0.995}}}}
                         nil))]
      (is (<= score 0.15))))

  (testing "high zero-fraction (numeric) penalizes score"
    (let [score (:score (dim/distribution-shape
                         {:fingerprint {:type {:type/Number {:zero-fraction 0.96}}}}
                         nil))]
      (is (<= score 0.1))))

  (testing "temporal mode-fraction penalizes dumping-ground timestamps"
    (let [score (:score (dim/distribution-shape
                         {:fingerprint {:type {:type/DateTime {:mode-fraction 0.95}}}}
                         nil))]
      (is (<= score 0.1)))))

;;; -------------------------------------------------- text-structure blank% --------------------------------------------------

(deftest ^:parallel text-structure-blank-test
  (testing "mostly-blank text scores very low"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:blank% 0.9}}}}
                         nil))]
      (is (<= score 0.15))))

  (testing "low blank% doesn't trigger the penalty"
    (let [score (:score (dim/text-structure
                         {:fingerprint {:type {:type/Text {:blank% 0.1 :average-length 10}}}}
                         nil))]
      (is (>= score 0.7)))))
