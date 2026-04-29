(ns metabase.interestingness.impl-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.interestingness.impl :as impl]))

;;; -------------------------------------------------- type-penalty --------------------------------------------------

(deftest ^:parallel type-penalty-test
  (testing "penalized types score 0.0"
    (are [sem-type reason-substr]
         (let [{:keys [score reason]} (impl/type-penalty {:semantic-type sem-type})]
           (and (= 0.0 score) (re-find (re-pattern reason-substr) reason)))
      :type/PK                "primary key"
      :type/SerializedJSON    "structured blob"
      :type/JSON              "structured blob"
      :type/XML               "structured blob"
      :type/Array             "structured blob"
      :type/Dictionary        "structured blob"
      :type/UpdatedTimestamp  "updated timestamp"
      :type/DeletionTimestamp "deletion timestamp"))

  (testing "non-penalized types score 1.0 (including FK — x-ray templates use FK columns)"
    (are [sem-type]
         (= 1.0 (:score (impl/type-penalty {:semantic-type sem-type})))
      :type/Category
      :type/Name
      :type/CreationTimestamp
      :type/Number
      :type/FK
      nil))

  (testing "nil semantic type scores 1.0"
    (is (= 1.0 (:score (impl/type-penalty {}))))))

;;; -------------------------------------------------- score-field composition --------------------------------------------------

(defn- constant-scorer [score reason]
  (fn [_field] {:score score :reason reason}))

(deftest ^:parallel score-field-test
  (testing "single scorer"
    (let [result (impl/score-field
                  {(constant-scorer 0.8 "good") 1.0}
                  {:semantic-type :type/Category})]
      (is (= 0.8 (:score result)))
      (is (map? (:scores result)))
      (is (= {:semantic-type :type/Category} (:field result)))))

  (testing "weighted average of two scorers"
    (let [result (impl/score-field
                  {(constant-scorer 1.0 "high") 0.75
                   (constant-scorer 0.5 "mid")  0.25}
                  {})]
      (is (= 0.875 (:score result)))))

  (testing "weights don't need to sum to 1"
    (let [result (impl/score-field
                  {(constant-scorer 1.0 "a") 3.0
                   (constant-scorer 0.5 "b") 1.0}
                  {})]
      (is (= 0.875 (:score result)))))

  (testing "hard-zero from any scorer clamps total to at most 0.1"
    (let [result (impl/score-field
                  {(constant-scorer 1.0 "high") 0.75
                   (constant-scorer 0.0 "gate") 0.25}
                  {})]
      (is (<= (:score result) 0.1))))

  (testing "empty scorer map returns 0.5"
    (is (= 0.5 (:score (impl/score-field {} {}))))))

(deftest ^:parallel compose-test
  (testing "compose returns a callable scorer"
    (let [composed (impl/compose
                    {(constant-scorer 0.8 "a") 1.0
                     (constant-scorer 0.6 "b") 1.0})
          result   (composed {})]
      (is (= 0.7 (:score result))))))

(deftest ^:parallel apply-cutoff-test
  (testing "filters below threshold"
    (let [scored [{:score 0.8 :field :a}
                  {:score 0.3 :field :b}
                  {:score 0.5 :field :c}]]
      (is (= [{:score 0.8 :field :a} {:score 0.5 :field :c}]
             (impl/apply-cutoff 0.5 scored)))))

  (testing "empty input returns empty"
    (is (empty? (impl/apply-cutoff 0.5 [])))))

(deftest ^:parallel score-and-filter-test
  (testing "scores, filters, and sorts descending"
    (let [fields [{:name "good"} {:name "bad"} {:name "ok"}]
          name-scorer (fn [field]
                        (let [len (count (:name field))]
                          {:score (/ len 10.0) :reason (str len " chars")}))
          results (impl/score-and-filter
                   {name-scorer 1.0} fields 0.25)]
      (is (= 2 (count results)))
      (is (= "good" (-> results first :field :name)))
      (is (>= (-> results first :score) (-> results second :score))))))

;;; -------------------------------------------------- nullness --------------------------------------------------

(deftest ^:parallel nullness-test
  (testing "0% null scores 1.0"
    (is (= 1.0 (:score (impl/nullness {:fingerprint {:global {:nil% 0.0}}})))))

  (testing "100% null scores 0.0"
    (is (= 0.0 (:score (impl/nullness {:fingerprint {:global {:nil% 1.0}}})))))

  (testing "50% null scores 0.5"
    (is (= 0.5 (:score (impl/nullness {:fingerprint {:global {:nil% 0.5}}})))))

  (testing "missing fingerprint returns 0.5"
    (is (= 0.5 (:score (impl/nullness {}))))))

;;; -------------------------------------------------- numeric-variance --------------------------------------------------

(deftest ^:parallel numeric-variance-test
  (testing "zero sd scores 0.0"
    (is (= 0.0 (:score (impl/numeric-variance
                        {:fingerprint {:type {:type/Number {:sd 0.0 :avg 10.0}}}})))))

  (testing "q1 = q3 scores low"
    (is (<= (:score (impl/numeric-variance
                     {:fingerprint {:type {:type/Number {:q1 5.0 :q3 5.0}}}}))
            0.1)))

  (testing "healthy spread scores high"
    (let [score (:score (impl/numeric-variance
                         {:fingerprint {:type {:type/Number {:sd 10.0 :avg 50.0 :min 0 :max 100}}}}))]
      (is (> score 0.3))))

  (testing "non-numeric field returns 0.5"
    (is (= 0.5 (:score (impl/numeric-variance {}))))
    (is (= 0.5 (:score (impl/numeric-variance {:fingerprint {:type {:type/Text {}}}}))))))

;;; -------------------------------------------------- distribution-shape --------------------------------------------------

(deftest ^:parallel distribution-shape-test
  (testing "no distribution data returns 0.5"
    (is (= 0.5 (:score (impl/distribution-shape {}))))
    (is (= 0.5 (:score (impl/distribution-shape
                        {:fingerprint {:type {:type/Number {:avg 10 :sd 2}}}})))))

  (testing "symmetric low-dominance distribution scores high"
    (let [score (:score (impl/distribution-shape
                         {:fingerprint {:type {:type/Number {:skewness 0.1 :mode-fraction 0.1}}}}))]
      (is (>= score 0.9))))

  (testing "heavy skew penalizes score"
    (let [score (:score (impl/distribution-shape
                         {:fingerprint {:type {:type/Number {:skewness 3.0 :mode-fraction 0.1}}}}))]
      (is (<= score 0.5))))

  (testing "high mode-dominance scores very low"
    (let [score (:score (impl/distribution-shape
                         {:fingerprint {:type {:type/Text {:mode-fraction 0.97}}}}))]
      (is (<= score 0.1))))

  (testing "80% dominance scores low but not critical"
    (let [score (:score (impl/distribution-shape
                         {:fingerprint {:type {:type/Text {:mode-fraction 0.85}}}}))]
      (is (>= score 0.15))
      (is (<= score 0.3))))

  (testing "combined signals: worst-of-two wins"
    (let [score (:score (impl/distribution-shape
                         {:fingerprint {:type {:type/Number {:skewness 0.1 :mode-fraction 0.95}}}}))]
      (is (<= score 0.1))))

  (testing "works on text fields via type/Text fingerprint"
    (let [score (:score (impl/distribution-shape
                         {:fingerprint {:type {:type/Text {:mode-fraction 0.3}}}}))]
      (is (>= score 0.9))))

  (testing "extreme excess kurtosis penalizes score"
    (let [score (:score (impl/distribution-shape
                         {:fingerprint {:type {:type/Number {:excess-kurtosis 20.0}}}}))]
      (is (<= score 0.2))))

  (testing "near-normal kurtosis scores high"
    (let [score (:score (impl/distribution-shape
                         {:fingerprint {:type {:type/Number {:excess-kurtosis 0.2}}}}))]
      (is (>= score 0.9))))

  (testing "high top-3-fraction penalizes score"
    (let [score (:score (impl/distribution-shape
                         {:fingerprint {:type {:type/Text {:mode-fraction 0.4 :top-3-fraction 0.995}}}}))]
      (is (<= score 0.15))))

  (testing "high zero-fraction (numeric) penalizes score"
    (let [score (:score (impl/distribution-shape
                         {:fingerprint {:type {:type/Number {:zero-fraction 0.96}}}}))]
      (is (<= score 0.1))))

  (testing "temporal mode-fraction penalizes dumping-ground timestamps"
    (let [score (:score (impl/distribution-shape
                         {:fingerprint {:type {:type/DateTime {:mode-fraction 0.95}}}}))]
      (is (<= score 0.1)))))
