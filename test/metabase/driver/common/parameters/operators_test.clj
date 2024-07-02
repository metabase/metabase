(ns metabase.driver.common.parameters.operators-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.common.parameters.operators :as params.ops]
   [metabase.query-processor.error-type :as qp.error-type]))

(deftest ^:parallel to-clause-test
  (testing "number operations"
    (is (= (params.ops/to-clause {:type   :number/=
                                  :target [:dimension
                                           [:field
                                            26
                                            {:source-field 5}]]
                                  :value  [3]})
           [:= [:field 26 {:source-field 5}] 3]))))

(deftest ^:parallel to-clause-test-2
  (testing "number operations"
    (is (= (params.ops/to-clause {:type   :number/between
                                  :target [:dimension
                                           [:field
                                            26
                                            {:source-field 5}]]
                                  :value  [3 9]})
           [:between [:field 26 {:source-field 5}] 3 9]))))

(deftest ^:parallel to-clause-test-3
  (testing "number operations"
    (testing "equality is variadic"
      (is (= [:= [:field 26 {:source-field 5}] 3 4 5]
             (params.ops/to-clause {:type   :number/=
                                    :target [:dimension
                                             [:field
                                              26
                                              {:source-field 5}]]
                                    :value  [3 4 5]}))))))

(deftest ^:parallel to-clause-test-4
  (testing "string operations"
    (is (= (params.ops/to-clause {:type   :string/starts-with
                                  :target [:dimension
                                           [:field
                                            26
                                            {:source-field 5}]]
                                  :value  ["foo"]})
           [:starts-with [:field 26 {:source-field 5}] "foo"]))
    (testing "with options"
      (is (= (params.ops/to-clause {:type   :string/starts-with
                                    :target [:dimension
                                             [:field
                                              26
                                              {:source-field 5}]]
                                    :value  ["foo"]
                                    :options {:case-insensitive false}})
             [:starts-with [:field 26 {:source-field 5}] "foo" {:case-insensitive false}])))
    (testing "with multiple arguments"
      (is (= (params.ops/to-clause {:type   :string/starts-with
                                    :target [:dimension
                                             [:field
                                              26
                                              {:source-field 5}]]
                                    :value  ["foo" "bar"]})
             [:starts-with {} [:field 26 {:source-field 5}] "foo" "bar"]))

      (testing "with options"
        (is (= (params.ops/to-clause {:type   :string/starts-with
                                      :target [:dimension
                                               [:field
                                                26
                                                {:source-field 5}]]
                                      :value  ["foo" "bar"]
                                      :options {:case-insensitive false}})
               [:starts-with {:case-insensitive false} [:field 26 {:source-field 5}] "foo" "bar"]))))))

(deftest ^:parallel to-clause-test-5
  (testing "string operations"
    (is (= (params.ops/to-clause {:type   :string/does-not-contain
                                  :target [:dimension
                                           [:field
                                            26
                                            {:source-field 5}]]
                                  :value  ["foo"]})
           [:does-not-contain [:field 26 {:source-field 5}] "foo"]))))

(deftest ^:parallel to-clause-test-6
  (testing "arity errors"
    (letfn [(f [op values]
              (try
                (let [result (params.ops/to-clause {:type   op
                                                    :target [:dimension
                                                             [:field
                                                              26
                                                              {:source-field 5}]]
                                                    :value  values})]
                  (is (not result) "Did not throw"))
                (catch Exception e
                  (ex-data e))))]
      (doseq [[op values] [[:number/>= [2 4]]
                           [:number/between [1]]
                           [:number/between [1 2 3]]]]
        (is (=? {:param-type  op
                 :param-value values
                 :field-id    pos-int?
                 :type        qp.error-type/invalid-parameter}
                (f op values)))))))
