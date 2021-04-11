(ns metabase.query-processor.middleware.desugar-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.middleware.desugar :as desugar]
            [metabase.test :as mt]))

;; actual desugaring logic and tests are in the MBQL lib
(deftest e2e-test
  (is (= {:database 1
          :type     :query
          :query    {:source-table 1
                     :filter       [:and
                                    [:= [:field 1 nil] "Run Query"]
                                    [:between
                                     [:field 2 {:temporal-unit :day}]
                                     [:relative-datetime -30 :day]
                                     [:relative-datetime -1 :day]]
                                    [:!= [:field 3 nil] "(not set)"]
                                    [:!= [:field 3 nil] "url"]]
                     :aggregation  [[:share [:and
                                             [:= [:field 1 nil] "Run Query"]
                                             [:between
                                              [:field 2 {:temporal-unit :day}]
                                              [:relative-datetime -30 :day]
                                              [:relative-datetime -1 :day]]
                                             [:!= [:field 3 nil] "(not set)"]
                                             [:!= [:field 3 nil] "url"]]]]}}
         (:pre
          (mt/test-qp-middleware
           desugar/desugar
           {:database 1
            :type     :query
            :query    {:source-table 1
                       :filter       [:and
                                      [:= [:field 1 nil] "Run Query"]
                                      [:time-interval [:field 2 nil] -30 :day]
                                      [:!= [:field 3 nil] "(not set)" "url"]]
                       :aggregation  [[:share [:and
                                               [:= [:field 1 nil] "Run Query"]
                                               [:time-interval [:field 2 nil] -30 :day]
                                               [:!= [:field 3 nil] "(not set)" "url"]]]]}})))))
