(ns metabase.driver.common.parameters.operators-test
  (:require [clojure.test :refer :all]
            [metabase.driver.common.parameters.operators :as ops]
            [metabase.query-processor.error-type :as qp.error-type]
            [schema.core :as s]))

(deftest to-clause-test
  (testing "number operations"
    (is (= (ops/to-clause {:type :number/=
                           :target [:dimension
                                    [:field
                                     26
                                     {:source-field 5}]]
                           :value [3]})
           [:= [:field 26 {:source-field 5}] 3]))
    (is (= (ops/to-clause {:type :number/between
                           :target [:dimension
                                    [:field
                                     26
                                     {:source-field 5}]]
                           :value [3 9]})
           [:between [:field 26 {:source-field 5}] 3 9]))
    (testing "equality is variadic"
      (is (= [:= [:field 26 {:source-field 5}] 3 4 5]
             (ops/to-clause {:type :number/=
                             :target [:dimension
                                      [:field
                                       26
                                       {:source-field 5}]]
                             :value [3 4 5]})))))
  (testing "string operations"
    (is (= (ops/to-clause {:type :string/starts-with
                           :target [:dimension
                                    [:field
                                     26
                                     {:source-field 5}]]
                           :value ["foo"]})
           [:starts-with [:field 26 {:source-field 5}] "foo"]))
    (is (= (ops/to-clause {:type :string/does-not-contain
                           :target [:dimension
                                    [:field
                                     26
                                     {:source-field 5}]]
                           :value ["foo"]})
           [:does-not-contain [:field 26 {:source-field 5}] "foo"])))
  (testing "arity errors"
    (letfn [(f [op values]
              (try
                (ops/to-clause {:type op
                                :target [:dimension
                                         [:field
                                          26
                                          {:source-field 5}]]
                                :value values})
                (is false "Did not throw")
                (catch Exception e
                  (ex-data e))))]
      (doseq [[op values] [[:string/starts-with ["a" "b"]]
                           [:number/between [1]]
                           [:number/between [1 2 3]]]]
        (is (schema= {:param-type (s/eq op)
                      :param-value (s/eq values)
                      :field-id s/Any
                      :type (s/eq qp.error-type/invalid-parameter)}
                     (f op values)))))))
