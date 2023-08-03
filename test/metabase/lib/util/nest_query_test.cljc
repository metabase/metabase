(ns metabase.lib.util.nest-query-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util.nest-query :as lib.util.nest-query]
   #?@(:cljs
       ([metabase.test-runner.assert-exprs.approximately-equal]))))

(comment metabase.lib.core/keep-me)

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel nest-expressions-test
  (let [query {:lib/type     :mbql/query
               :lib/metadata meta/metadata-provider
               :database     (meta/id)
               :stages       [{:lib/type     :mbql.stage/mbql
                               :source-table #lib/id venues
                               :expressions  [[:*
                                               #lib/opts {:lib/expression-name "double_price"}
                                               #lib/field venues.price
                                               2]]
                               :breakout     [#lib/field venues.price]
                               :aggregation  [[:count #lib/opts {}]]
                               :fields       [[:expression #lib/opts {} "double_price"]]
                               :order-by     [[:asc #lib/opts {} #lib/field venues.price]
                                              [:asc #lib/opts {} #lib/field venues.id]]}]}]
    (is (=? {:lib/type     :mbql/query
             :lib/metadata meta/metadata-provider
             :database     (meta/id)
             :stages       [{:lib/type     :mbql.stage/mbql
                             :source-table #lib/id venues
                             :expressions  [[:*
                                             {:lib/expression-name "double_price"}
                                             [:field {} #lib/id venues.price]
                                             2]]
                             :fields       [[:field {} #lib/id venues.id]
                                            [:field {} #lib/id venues.name]
                                            [:field {} #lib/id venues.category-id]
                                            [:field {} #lib/id venues.latitude]
                                            [:field {} #lib/id venues.longitude]
                                            [:field {} #lib/id venues.price]
                                            [:expression {} "double_price"]]}
                            {:lib/type    :mbql.stage/mbql
                             :breakout    [[:field {} "PRICE"]]
                             :aggregation [[:count {}]]
                             :fields      [[:field {:base-type :type/Integer} "double_price"]]
                             :order-by    [[:asc {} [:field {} "PRICE"]]
                                           [:asc {} [:field {} "ID"]]]}]}
            (lib.util.nest-query/nest-expressions query)))))
