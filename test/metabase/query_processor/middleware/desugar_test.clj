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
                                    [:= [:field-id 1] "Run Query"]
                                    [:between
                                     [:datetime-field [:field-id 2] :day]
                                     [:relative-datetime -30 :day]
                                     [:relative-datetime -1 :day]]
                                    [:!= [:field-id 3] "(not set)"]
                                    [:!= [:field-id 3] "url"]]
                     :aggregation  [[:share [:and
                                             [:= [:field-id 1] "Run Query"]
                                             [:between
                                              [:datetime-field [:field-id 2] :day]
                                              [:relative-datetime -30 :day]
                                              [:relative-datetime -1 :day]]
                                             [:!= [:field-id 3] "(not set)"]
                                             [:!= [:field-id 3] "url"]]]]}}
         (:pre
          (mt/test-qp-middleware
           desugar/desugar
           {:database 1
            :type     :query
            :query    {:source-table 1
                       :filter       [:and
                                      [:= [:field-id 1] "Run Query"]
                                      [:time-interval [:field-id 2] -30 :day]
                                      [:!= [:field-id 3] "(not set)" "url"]]
                       :aggregation  [[:share [:and
                                               [:= [:field-id 1] "Run Query"]
                                               [:time-interval [:field-id 2] -30 :day]
                                               [:!= [:field-id 3] "(not set)" "url"]]]]}})))))
