(ns metabase.query-processor.middleware.desugar-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.middleware.desugar :as desugar]))

;; actual desugaring logic and tests are in [[metabase.mbql.util-test]]
(deftest ^:parallel e2e-test
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
                                    [:!= [:field 3 nil] "url"]
                                    [:> [:temporal-extract [:field 4 nil] :year-of-era] [:/ [:/ 1 2] 3]]]
                     :expressions  {"year" [:+
                                            [:temporal-extract [:field 4 nil] :year-of-era]
                                            [:/ [:/ [:/ 1 2] 3] 4]]}
                     :aggregation  [[:share [:and
                                             [:= [:field 1 nil] "Run Query"]
                                             [:between
                                              [:field 2 {:temporal-unit :day}]
                                              [:relative-datetime -30 :day]
                                              [:relative-datetime -1 :day]]
                                             [:!= [:field 3 nil] "(not set)"]
                                             [:!= [:field 3 nil] "url"]]]]}}
         (desugar/desugar
          {:database 1
           :type     :query
           :query    {:source-table 1
                      :filter       [:and
                                     [:= [:field 1 nil] "Run Query"]
                                     [:time-interval [:field 2 nil] -30 :day]
                                     [:!= [:field 3 nil] "(not set)" "url"]
                                     [:> [:get-year [:field 4 nil]] [:/ 1 2 3]]]
                      :expressions  {"year" [:+
                                             [:get-year [:field 4 nil]]
                                             [:/ 1 2 3 4]]}
                      :aggregation  [[:share [:and
                                              [:= [:field 1 nil] "Run Query"]
                                              [:time-interval [:field 2 nil] -30 :day]
                                              [:!= [:field 3 nil] "(not set)" "url"]]]]}}))))
