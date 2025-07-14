(ns metabase.lib.convert-desugar-integration-test
  "Integration tests for the interaction between lib.convert and legacy MBQL desugaring.

   These tests ensure that pMBQL queries converted to legacy MBQL format can be properly
   processed by the desugar middleware."
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.convert :as lib.convert]))

(deftest ^:parallel between-with-options-desugar-integration-test
  (testing "between with options from lib.convert can be desugared"
    (are [pmbql-filter expected-desugared]
         (let [pmbql-query   {:lib/type :mbql/query
                              :database 1
                              :stages [{:lib/type :mbql.stage/mbql
                                        :source-table 1
                                        :filters [pmbql-filter]}]}
               legacy-query  (lib.convert/->legacy-MBQL pmbql-query)
               legacy-filter (get-in legacy-query [:query :filter])
               desugared     (mbql.u/desugar-filter-clause legacy-filter)]
           (is (= expected-desugared desugared)
               "Desugar produces expected result"))

      ;; Standard between - no desugaring needed
      [:between {} [:field {} 1] 10 20]
      [:between [:field 1 nil] 10 20]

      ;; min-inclusive false
      [:between {:min-inclusive false} [:field {} 1] 10 20]
      [:and [:> [:field 1 nil] 10] [:<= [:field 1 nil] 20]]

      ;; max-inclusive false
      [:between {:max-inclusive false} [:field {} 1] 10 20]
      [:and [:>= [:field 1 nil] 10] [:< [:field 1 nil] 20]]

      ;; both false
      [:between {:min-inclusive false, :max-inclusive false} [:field {} 1] 10 20]
      [:and [:> [:field 1 nil] 10] [:< [:field 1 nil] 20]]

      ;; both explicitly true - desugaring has no effect
      [:between {:min-inclusive true, :max-inclusive true} [:field {} 1] 10 20]
      [:between [:field 1 nil] 10 20])))
