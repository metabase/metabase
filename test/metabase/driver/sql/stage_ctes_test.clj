(ns ^:mb/driver-tests metabase.driver.sql.stage-ctes-test
  "Translation of manual tests done in the UI for CTE compilation into unit tests.
   1. A multi-stage question with many joins and aggregations
   2. A native question that selects from 1. with a filter variable
   3. A question that joins 1. with an aggregation and filter"
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.test :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]))

(defn- col
  ([cols col-name]
   (col cols col-name nil))
  ([cols col-name join-alias]
   (or (m/find-first #(and (= (u/lower-case-en (:name %)) col-name)
                           (= (lib/current-join-alias %) join-alias)
                           (not= (:lib/source %) :source/implicitly-joinable))
                     cols)
       (throw (ex-info "Column not found" {:name col-name, :join-alias join-alias})))))

(defn- join-alias
  [query]
  (:alias (last (lib/joins query))))

(defn- multi-stage-query
  "Total order amount per user and product category, then per user source, sorted by the total:

  stage 0: orders, sum of total by user_id and product_id
  stage 1: join products, sum of the sum by user_id and products.category
  stage 2: join people, sum of the sum by people.source, ordered by the sum"
  [mp]
  (let [field #(lib.metadata/field mp (mt/id %1 %2))
        query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                  (lib/aggregate (lib/sum (field :orders :total)))
                  (lib/breakout (field :orders :user_id))
                  (lib/breakout (field :orders :product_id))
                  lib/append-stage)
        query (lib/join query (lib/join-clause (lib.metadata/table mp (mt/id :products))
                                               [(lib/= (col (lib/visible-columns query) "product_id")
                                                       (field :products :id))]))
        query (-> query
                  (lib/aggregate (lib/sum (col (lib/visible-columns query) "sum")))
                  (lib/breakout (col (lib/breakoutable-columns query) "user_id"))
                  (lib/breakout (col (lib/breakoutable-columns query) "category" (join-alias query)))
                  lib/append-stage)
        query (lib/join query (lib/join-clause (lib.metadata/table mp (mt/id :people))
                                               [(lib/= (col (lib/visible-columns query) "user_id")
                                                       (field :people :id))]))
        query (-> query
                  (lib/aggregate (lib/sum (col (lib/visible-columns query) "sum")))
                  (lib/breakout (col (lib/breakoutable-columns query) "source" (join-alias query))))]
    (lib/order-by query (lib/aggregation-ref query 0))))

(defn- native-query-on-card
  "A native query that selects from Card 1 with a required number variable in the `WHERE` clause."
  [mp]
  ;; some databases (e.g. MySQL and Postgres before 16) require an alias for a subquery in FROM
  (let [sql   (str "SELECT * FROM {{#1-card-1}} source_card WHERE " (sql.u/quote-name driver/*driver* :field "sum") " < {{sum_limit}}")
        query (lib/native-query mp sql)]
    (lib/with-template-tags query (mapv (fn [tag]
                                          (cond-> tag
                                            (= (:name tag) "sum_limit") (assoc :type :number, :required true, :default "1")))
                                        (lib/template-tags query)))))

(defn- query-joining-card
  "People joined to Card 1 on source, count by birth year and creation year, then a filter on the count, ordered by
  birth year, creation year and count, limited to 5 rows."
  [mp]
  (let [field #(lib.metadata/field mp (mt/id %1 %2))
        card  (lib.metadata/card mp 1)
        query (lib/query mp (lib.metadata/table mp (mt/id :people)))
        query (lib/join query (lib/join-clause card [(lib/= (field :people :source)
                                                            (col (lib/join-condition-rhs-columns query card nil nil) "source"))]))
        query (-> query
                  (lib/aggregate (lib/count))
                  (lib/breakout (lib/with-temporal-bucket (field :people :birth_date) :year))
                  (lib/breakout (lib/with-temporal-bucket (field :people :created_at) :year))
                  lib/append-stage)]
    (-> query
        (lib/filter (lib/> (col (lib/filterable-columns query) "count") 11))
        (lib/order-by (col (lib/orderable-columns query) "birth_date"))
        (lib/order-by (col (lib/orderable-columns query) "created_at"))
        (lib/order-by (col (lib/orderable-columns query) "count"))
        (lib/limit 5))))

(deftest ^:parallel multi-stage-questions-test
  (mt/test-drivers (mt/normal-driver-select {:+fns [#(and (isa? driver/hierarchy % :sql)
                                                          (sql.qp/use-ctes-for-stages? %))]
                                             :+features [:nested-queries :left-join :native-parameter-card-reference]})
    (let [mp         (qp.test-util/metadata-provider-with-cards-for-queries
                      [(lib/limit (multi-stage-query (mt/metadata-provider)) 100)])
          round-sums (partial mt/formatted-rows [str #(u/round-to-decimals 2 (double %))])]
      (testing "multi-stage question with joins"
        (let [query (multi-stage-query mp)]
          (mt/with-native-query-testing-context query
            (let [query-result (qp/process-query query)]
              (is (= [["Affiliate" 281997.3]
                      ["Twitter"   302138.79]
                      ["Organic"   305583.3]
                      ["Google"    306376.03]
                      ["Facebook"  314522.28]]
                     (round-sums query-result)))
              (is (re-find #"WITH.*__mb_stage"
                           (-> query-result :data :native_form :query)))))))
      (testing "native question selecting from the multi-stage question with a variable"
        (let [query (assoc (native-query-on-card mp)
                           :parameters [{:type   :number/=
                                         :target [:variable [:template-tag "sum_limit"]]
                                         :value  [305000]}])]
          (mt/with-native-query-testing-context query
            ;; the native query has no ORDER BY, so the order of the rows is not defined
            (is (= [["Affiliate" 281997.3]
                    ["Twitter"   302138.79]]
                   (sort (round-sums (qp/process-query query))))))))
      (testing "question joining the multi-stage question, with more stages after the join"
        (let [query  (query-joining-card mp)]
          (mt/with-native-query-testing-context query
            (is (= [["1958-01-01T00:00:00Z" "2017-01-01T00:00:00Z" 13]
                    ["1958-01-01T00:00:00Z" "2018-01-01T00:00:00Z" 17]
                    ["1959-01-01T00:00:00Z" "2016-01-01T00:00:00Z" 14]
                    ["1959-01-01T00:00:00Z" "2017-01-01T00:00:00Z" 19]
                    ["1959-01-01T00:00:00Z" "2018-01-01T00:00:00Z" 24]]
                   (mt/formatted-rows [u.date/temporal-str->iso8601-str u.date/temporal-str->iso8601-str int]
                                      (qp/process-query query))))))))))
