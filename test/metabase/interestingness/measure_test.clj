(ns metabase.interestingness.measure-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.interestingness.measure :as measure]))

;;; -------------------------------------------------- measure-type-suitability --------------------------------------------------

(deftest ^:parallel measure-type-suitability-test
  (testing "PKs are strongly penalized as measures — one PK per row, aggregating is meaningless"
    (is (<= (:score (measure/measure-type-suitability {:base-type :type/Integer :semantic-type :type/PK})) 0.1)))

  (testing "FKs get a middle score — SUM/AVG are nonsense, but COUNT DISTINCT is useful"
    (let [s (:score (measure/measure-type-suitability {:base-type :type/Integer :semantic-type :type/FK}))]
      (is (< 0.3 s 0.7))))

  (testing "numeric types score 1.0"
    (is (= 1.0 (:score (measure/measure-type-suitability {:base-type :type/Integer}))))
    (is (= 1.0 (:score (measure/measure-type-suitability {:base-type :type/Float}))))
    (is (= 1.0 (:score (measure/measure-type-suitability {:base-type :type/Decimal})))))

  (testing "effective-type wins over base-type"
    (is (= 1.0 (:score (measure/measure-type-suitability
                        {:base-type :type/Text :effective-type :type/Integer})))))

  (testing "boolean scores ~0.6 (COUNT and SUM 0/1 work)"
    (let [s (:score (measure/measure-type-suitability {:base-type :type/Boolean}))]
      (is (> s 0.5))
      (is (< s 0.8))))

  (testing "text scores low (only COUNT/COUNT DISTINCT)"
    (is (< (:score (measure/measure-type-suitability {:base-type :type/Text})) 0.5)))

  (testing "temporal scores low (only MIN/MAX)"
    (is (< (:score (measure/measure-type-suitability {:base-type :type/DateTime})) 0.4)))

  (testing "unknown types score 0.1"
    (is (= 0.1 (:score (measure/measure-type-suitability {:base-type :type/*}))))))
