(ns metabase.query-processor.middleware.auto-parse-filter-values-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.middleware.auto-parse-filter-values :as auto-parse-filter-values]
            [metabase.test :as mt]))

(deftest parse-value-for-base-type-test
  (testing "Should throw an Exception with a useful error message if parsing fails"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Error filtering against :type/Integer Field: unable to parse String \"s\" to a :type/Integer"
         (#'auto-parse-filter-values/parse-value-for-base-type "s" :type/Integer)))))

(defn- auto-parse-filter-values [query]
  (mt/test-qp-middleware auto-parse-filter-values/auto-parse-filter-values query))

(deftest auto-parse-filter-values-test
  (doseq [[base-type expected] {:type/Integer    4
                                :type/BigInteger 4N
                                :type/Float      4.0
                                :type/Decimal    4M
                                :type/Boolean    true}]
    (testing (format "A String parameter that has %s should get parsed to a %s"
                     base-type (.getCanonicalName (class expected)))
      (is (= (mt/$ids venues
               [:= $price [:value expected {:base_type base-type}]])
             (-> (mt/mbql-query venues {:filter [:= $price [:value (str expected) {:base_type base-type}]]})
                 auto-parse-filter-values
                 :pre :query :filter))))))

(deftest parse-large-integers-test
  (testing "Should parse Integer strings to Longs in case they're extra-big"
    (let [n     (inc (long Integer/MAX_VALUE))
          query (mt/mbql-query venues {:filter [:= $price [:value (str n) {:base_type :type/Integer}]]})]
      (testing (format "\nQuery = %s" (pr-str query))
        (is (= (mt/$ids venues
                 [:= $price [:value n {:base_type :type/Integer}]])
               (-> (auto-parse-filter-values query)
                   :pre
                   :query
                   :filter)))))))
