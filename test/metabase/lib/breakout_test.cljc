(ns metabase.lib.breakout-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel query-name-with-breakouts-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "CHECKINS")
                  (lib/aggregate (lib/count))
                  (lib/breakout (lib/with-temporal-bucket (lib/field (meta/id :checkins :date)) :year)))]
    (is (=? {:lib/type :mbql/query
             :database (meta/id)
             :stages   [{:lib/type     :mbql.stage/mbql
                         :source-table (meta/id :checkins)
                         :aggregation  [[:count {}]]
                         :breakout     [[:field
                                         {:base-type :type/Date, :temporal-unit :year}
                                         (meta/id :checkins :date)]]}]}
            query))
    (is (= "Checkins, Count, Grouped by Date (year)"
           (lib/display-name query query)
           (lib/describe-query query)
           (lib/suggested-name query)))))

(deftest ^:parallel breakouts-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "CHECKINS")
                  (lib/breakout (lib/field (meta/id :checkins :date))))]
    (is (=? [[:field {} (meta/id :checkins :date)]]
            (lib/breakouts query)))))

(deftest ^:parallel breakout-should-drop-invalid-parts
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/with-fields [(lib/field "VENUES" "PRICE")])
                  (lib/order-by (lib/field "VENUES" "PRICE"))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :categories)
                                                 [(lib/=
                                                    (lib/field "VENUES" "CATEGORY_ID")
                                                    (lib/with-join-alias (lib/field "CATEGORIES" "ID") "Cat"))])
                                (lib/with-join-fields [(lib/field "CATEGORIES" "ID")])))
                  (lib/append-stage)
                  (lib/with-fields [(lib/field "VENUES" "PRICE")])
                  (lib/breakout 0 (lib/field "VENUES" "CATEGORY_ID")))
        first-stage (lib.util/query-stage query 0)
        first-join (first (lib/joins query 0))]
    (is (= 1 (count (:stages query))))
    (is (not (contains? first-stage :fields)))
    (is (not (contains? first-stage :order-by)))
    (is (= 1 (count (lib/joins query 0))))
    (is (not (contains? first-join :fields))))
  (testing "Already summarized query should be left alone"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/breakout (lib/field "VENUES" "CATEGORY_ID"))
                    (lib/order-by (lib/field "VENUES" "CATEGORY_ID"))
                    (lib/append-stage)
                    (lib/breakout 0 (lib/field "VENUES" "PRICE")))
          first-stage (lib.util/query-stage query 0)]
      (is (= 2 (count (:stages query))))
      (is (contains? first-stage :order-by)))))
