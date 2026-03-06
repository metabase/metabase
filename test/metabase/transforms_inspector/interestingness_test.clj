(ns metabase.transforms-inspector.interestingness-test
  (:require
   [clojure.test :refer :all]
   [metabase.transforms-inspector.interestingness :as interestingness]))

;;; -------------------------------------------------- dominated-column? --------------------------------------------------

(deftest dominated-column-pk-test
  (is (true? (interestingness/dominated-column?
              {:name "id" :semantic_type :type/PK :base_type :type/Integer}))))

(deftest dominated-column-fk-test
  (is (true? (interestingness/dominated-column?
              {:name "user_id" :semantic_type :type/FK :base_type :type/Integer}))))

(deftest dominated-column-uuid-test
  (is (true? (interestingness/dominated-column?
              {:name "uuid" :semantic_type :type/UUID :base_type :type/Text}))))

(deftest dominated-column-serialized-json-test
  (is (true? (interestingness/dominated-column?
              {:name "data" :semantic_type :type/SerializedJSON :base_type :type/Text}))))

(deftest dominated-column-name-pattern-test
  (testing "name patterns that indicate dominated columns"
    (is (true? (interestingness/dominated-column?
                {:name "user_id" :base_type :type/Integer})))
    (is (true? (interestingness/dominated-column?
                {:name "ID" :base_type :type/Integer})))
    (is (true? (interestingness/dominated-column?
                {:name "order_uuid" :base_type :type/Text})))
    (is (true? (interestingness/dominated-column?
                {:name "UUID" :base_type :type/Text}))))
  (testing "name patterns that are not dominated"
    (is (not (interestingness/dominated-column?
              {:name "description" :base_type :type/Text})))
    (is (not (interestingness/dominated-column?
              {:name "video_length" :base_type :type/Integer})))
    (is (not (interestingness/dominated-column?
              {:name "identity" :base_type :type/Text})))))

;;; -------------------------------------------------- score-field --------------------------------------------------

(deftest score-field-dominated-test
  (testing "PK fields get score 0.0"
    (let [result (interestingness/score-field {:name "id" :semantic_type :type/PK :base_type :type/Integer})]
      (is (= 0.0 (:score result)))
      (is (true? (:dominated? result)))
      (is (= [:dominated-column] (:reasons result))))))

(deftest score-field-mostly-null-test
  (testing "mostly-null fields get score 0.1"
    (let [result (interestingness/score-field {:name "notes" :base_type :type/Text
                                               :stats {:nil_percent 0.95}})]
      (is (= 0.1 (:score result)))
      (is (not (:dominated? result)))
      (is (= [:mostly-null] (:reasons result))))))

(deftest score-field-high-cardinality-test
  (testing "high-cardinality without semantic type gets 0.2"
    (let [result (interestingness/score-field {:name "email" :base_type :type/Text
                                               :stats {:distinct_count 5000}})]
      (is (= 0.2 (:score result)))
      (is (= [:high-cardinality] (:reasons result)))))
  (testing "high-cardinality with high-interest semantic type does not get 0.2"
    (let [result (interestingness/score-field {:name "city" :base_type :type/Text
                                               :semantic_type :type/City
                                               :stats {:distinct_count 5000}})]
      (is (= 0.85 (:score result))))))

(deftest score-field-temporal-test
  (testing "temporal fields get high score"
    (let [result (interestingness/score-field {:name "created_at" :base_type :type/DateTime})]
      (is (= 0.9 (:score result)))
      (is (not (:dominated? result)))
      (is (some #{:temporal} (:reasons result))))))

(deftest score-field-categorical-test
  (testing "low-cardinality text fields score as categorical"
    (let [result (interestingness/score-field {:name "status" :base_type :type/Text
                                               :stats {:distinct_count 5}})]
      (is (= 0.8 (:score result)))
      (is (some #{:categorical} (:reasons result))))))

(deftest score-field-numeric-with-variance-test
  (testing "numeric fields with variance get decent score"
    (let [result (interestingness/score-field {:name "amount" :base_type :type/Float
                                               :stats {:min 0.0 :max 100.0}})]
      (is (= 0.75 (:score result)))
      (is (some #{:numeric-variance} (:reasons result))))))

(deftest score-field-high-interest-semantic-type-test
  (testing "fields with high-interest semantic types score well"
    (let [result (interestingness/score-field {:name "price" :base_type :type/Float
                                               :semantic_type :type/Price})]
      (is (= 0.85 (:score result)))
      (is (some #{:high-interest-semantic-type} (:reasons result))))))

(deftest score-field-default-test
  (testing "plain field with no special attributes gets default score"
    (let [result (interestingness/score-field {:name "foo" :base_type :type/Text})]
      (is (= 0.5 (:score result)))
      (is (= [:default] (:reasons result))))))

;;; -------------------------------------------------- interesting-fields --------------------------------------------------

(deftest interesting-fields-filters-by-threshold-test
  (let [fields [{:name "id"     :semantic_type :type/PK :base_type :type/Integer}
                {:name "name"   :base_type :type/Text}
                {:name "notes"  :base_type :type/Text :stats {:nil_percent 0.95}}
                {:name "amount" :base_type :type/Float :stats {:min 0.0 :max 100.0}}
                {:name "date"   :base_type :type/DateTime}]
        result (interestingness/interesting-fields fields {})]
    (testing "dominated (PK) and mostly-null fields are excluded"
      (is (not-any? #(= "id" (:name %)) result))
      (is (not-any? #(= "notes" (:name %)) result)))
    (testing "interesting fields are included and sorted by score descending"
      (let [names (mapv :name result)]
        (is (= "date" (first names)))
        (is (some #{"amount"} names))
        (is (some #{"name"} names))))))

(deftest interesting-fields-limit-test
  (let [fields [{:name "a" :base_type :type/DateTime}
                {:name "b" :base_type :type/Float :stats {:min 0.0 :max 10.0}}
                {:name "c" :base_type :type/Text :stats {:distinct_count 3}}
                {:name "d" :base_type :type/Text}]
        result (interestingness/interesting-fields fields {:limit 2})]
    (is (= 2 (count result)))))

(deftest interesting-fields-custom-threshold-test
  (let [fields [{:name "a" :base_type :type/Text}]
        result-low  (interestingness/interesting-fields fields {:threshold 0.1})
        result-high (interestingness/interesting-fields fields {:threshold 0.6})]
    (testing "with low threshold, default-scored fields pass"
      (is (= 1 (count result-low))))
    (testing "with high threshold, default-scored fields are excluded"
      (is (= 0 (count result-high))))))
