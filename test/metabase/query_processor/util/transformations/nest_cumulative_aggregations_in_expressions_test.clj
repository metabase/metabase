(ns metabase.query-processor.util.transformations.nest-cumulative-aggregations-in-expressions-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.util.transformations.nest-cumulative-aggregations-in-expressions :as nest-cumulative-aggregations-in-expressions]))

(deftest ^:parallel basic-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/breakout (meta/field-metadata :orders :created-at))
                  (lib/aggregate (lib/+ (lib/cum-sum (meta/field-metadata :orders :total))
                                        (lib/cum-count (meta/field-metadata :orders :total)))))]
    (is (=? {:lib/type :mbql/query
             :stages   [{:lib/type    :mbql.stage/mbql
                         :breakout    [[:field {} (meta/id :orders :created-at)]]
                         :aggregation [[:cum-sum
                                        {:name #"arg_.+"}
                                        [:field {} (meta/id :orders :total)]]
                                       [:cum-count
                                        {:name #"arg_.+"}
                                        [:field {} (meta/id :orders :total)]]]}
                        {:lib/type :mbql.stage/mbql
                         :fields   [[:field {} "CREATED_AT"]
                                    [:expression {} "expression"]]
                         :expressions
                         [[:+
                           {:name                "expression"
                            :lib/expression-name "expression"}
                           [:field {} #"arg_.+"]
                           [:field {} #"arg_.+"]]]}]}
            (#'nest-cumulative-aggregations-in-expressions/nest-cumulative-aggregations-in-expressions query)))))

(deftest ^:parallel plain-value-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/breakout (meta/field-metadata :orders :created-at))
                  (lib/aggregate (lib/+ (lib/cum-sum (meta/field-metadata :orders :total))
                                        1)))]
    (is (=? {:lib/type :mbql/query
             :stages   [{:lib/type    :mbql.stage/mbql
                         :breakout    [[:field {} (meta/id :orders :created-at)]]
                         :aggregation [[:cum-sum
                                        {:name #"arg_.+"}
                                        [:field {} (meta/id :orders :total)]]]}
                        {:lib/type :mbql.stage/mbql
                         :fields   [[:field {} "CREATED_AT"]
                                    [:expression {} "expression"]]
                         :expressions
                         [[:+
                           {:name                "expression"
                            :lib/expression-name "expression"}
                           [:field {} #"arg_.+"]
                           1]]}]}
            (#'nest-cumulative-aggregations-in-expressions/nest-cumulative-aggregations-in-expressions query)))))

(deftest ^:parallel recursive-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/breakout (meta/field-metadata :orders :created-at))
                  (lib/aggregate (lib/* (lib/+ (lib/cum-sum (meta/field-metadata :orders :total))
                                               (lib/cum-count (meta/field-metadata :orders :total)))
                                        1)))]
    (is (=? {:lib/type :mbql/query
             :stages   [{:lib/type    :mbql.stage/mbql
                         :breakout    [[:field {} (meta/id :orders :created-at)]]
                         :aggregation [[:cum-sum
                                        {:name #"arg_.+"}
                                        [:field {} (meta/id :orders :total)]]
                                       [:cum-count
                                        {:name #"arg_.+"}
                                        [:field {} (meta/id :orders :total)]]]}
                        {:lib/type    :mbql.stage/mbql
                         :fields      [[:field {} "CREATED_AT"]
                                       [:expression {} #"arg_.+"]]
                         :expressions [[:+
                                        {:name                #"arg_.+"
                                         :lib/expression-name #"arg_.+"}
                                        [:field {} #"arg_.+"]
                                        [:field {} #"arg_.+"]]]}
                        {:lib/type    :mbql.stage/mbql,
                         :fields      [[:field {} "CREATED_AT"]
                                       [:expression {} "expression"]]
                         :expressions [[:*
                                        {:name                "expression"
                                         :lib/expression-name "expression"}
                                        [:field {} #"arg_.+"]
                                        1]]}]}
            (#'nest-cumulative-aggregations-in-expressions/nest-cumulative-aggregations-in-expressions query)))))

;;; TODO -- what if you have an order by clause on one of the aggregations we unwind?
