(ns metabase.query-processor.middleware.desugar-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.desugar :as desugar]
   [metabase.test :as mt]))

;; actual desugaring logic and tests are in [[metabase.legacy-mbql.util-test]]
(deftest ^:parallel e2e-test
  (is (=? (lib.tu.macros/mbql-query orders
            {:filter       [:and
                            [:= $user-id->people.name "Run Query"]
                            [:between
                             !day.created-at
                             [:relative-datetime -30 :day]
                             [:relative-datetime -1 :day]]
                            [:>=
                             !default.created-at
                             [:+ [:relative-datetime -30 :day] [:interval -30 :day]]]
                            [:<
                             !default.created-at
                             [:+ [:relative-datetime 0 :day] [:interval -30 :day]]]
                            [:!= $user-id->people.source "(not set)"]
                            [:!= $user-id->people.source "Twitter"]
                            [:> [:temporal-extract $user-id->people.birth-date :year-of-era] [:/ [:/ 1 2] 3]]]
             :expressions  {"year" [:+
                                    [:temporal-extract $user-id->people.birth-date :year-of-era]
                                    [:/ [:/ [:/ 1 2] 3] 4]]}
             :aggregation  [[:share [:and
                                     [:= $user-id->people.name "Run Query"]
                                     [:between
                                      !day.created-at
                                      [:relative-datetime -30 :day]
                                      [:relative-datetime -1 :day]]
                                     [:!= $user-id->people.source "(not set)"]
                                     [:!= $user-id->people.source "Twitter"]]]]})
          (mt/with-metadata-provider meta/metadata-provider
            (desugar/desugar
             (lib.tu.macros/mbql-query orders
               {:filter       [:and
                               [:= $user-id->people.name "Run Query"]
                               [:time-interval !day.created-at -30 :day]
                               [:relative-time-interval $created-at -30 :day -30 :day]
                               [:!= $user-id->people.source "(not set)" "Twitter"]
                               [:> [:get-year $user-id->people.birth-date] [:/ 1 2 3]]]
                :expressions  {"year" [:+
                                       [:get-year $user-id->people.birth-date]
                                       [:/ 1 2 3 4]]}
                :aggregation  [[:share [:and
                                        [:= $user-id->people.name "Run Query"]
                                        [:time-interval $created-at -30 :day]
                                        [:!= $user-id->people.source "(not set)" "Twitter"]]]]}))))))
