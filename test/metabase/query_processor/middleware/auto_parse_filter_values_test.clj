(ns metabase.query-processor.middleware.auto-parse-filter-values-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.auto-parse-filter-values
    :as
    auto-parse-filter-values]))

(set! *warn-on-reflection* true)

(deftest ^:parallel parse-value-for-base-type-test
  (testing "Should throw an Exception with a useful error message if parsing fails"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Error filtering against :type/Integer Field: unable to parse String \"s\" to a :type/Integer"
         (#'auto-parse-filter-values/parse-value-for-base-type "s" :type/Integer)))))

(defn- auto-parse-filter-values [query]
  (auto-parse-filter-values/auto-parse-filter-values query))

(deftest ^:parallel auto-parse-filter-values-test
  (doseq [[base-type expected] {:type/Integer    4
                                :type/BigInteger 4N
                                :type/Float      4.0
                                :type/Decimal    4M
                                :type/Boolean    true}]
    (testing (format "A String parameter that has %s should get parsed to a %s"
                     base-type (.getCanonicalName (class expected)))
      (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                      (lib/filter (lib/= (meta/field-metadata :venues :price)
                                         ;; apparently we have no MLv2 helper for creating `:value` clauses
                                         [:value
                                          {:base-type base-type, :effective-type base-type, :lib/uuid (str (random-uuid))}
                                          (str expected)])))]
        (is (=? [:=
                 {}
                 [:field {} (meta/id :venues :price)]
                 [:value {:base-type base-type, :effective-type base-type} expected]]
                (-> query
                    auto-parse-filter-values
                    lib/filters
                    first)))))))

(deftest ^:parallel parse-large-integers-test
  (testing "Should parse Integer strings to Longs in case they're extra-big"
    (let [n     (inc (long Integer/MAX_VALUE))
          query (lib/query meta/metadata-provider
                           (lib.tu.macros/mbql-query venues
                             {:filter [:= $price [:value (str n) {:base_type :type/Integer}]]}))]
      (testing (format "\nQuery = %s" (pr-str query))
        (is (=? [:=
                 {}
                 [:field {} (meta/id :venues :price)]
                 [:value {:base-type :type/Integer, :effective-type :type/Integer} n]]
                (-> (auto-parse-filter-values query)
                    lib/filters
                    first)))))))
