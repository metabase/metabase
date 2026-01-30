(ns metabase.lib.query.util-test
  (:require
   #?@(:cljs
       [[metabase.test-runner.assert-exprs.approximately-equal]])
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query.util :as lib.query.util]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel test-query-basic-table-source-test
  (testing "test-query creates a basic query from a table source"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :venues)}}]})]
      (is (=? {:lib/type :mbql/query
               :database (meta/id)
               :stages   [{:lib/type     :mbql.stage/mbql
                           :source-table (meta/id :venues)}]}
              query)))))

(deftest ^:parallel test-query-with-card-source-test
  (testing "test-query creates a query from a card source"
    (let [query (lib.query.util/test-query
                 lib.tu/metadata-provider-with-card
                 {:stages [{:source {:type :card
                                     :id   1}}]})]
      (is (=? {:lib/type :mbql/query
               :database (meta/id)
               :stages   [{:lib/type    :mbql.stage/mbql
                           :source-card 1}]}
              query)))))

(deftest ^:parallel test-query-with-fields-test
  (testing "test-query adds fields to the query"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :orders)}
                            :fields [{:type :column
                                      :name "ID"
                                      :source-name "ORDERS"}

                                     ;; column without source-name can be found if it is unambiguous
                                     {:type :column
                                      :name "TOTAL"}

                                     ;; implicitly joined column
                                     {:type :column
                                      :name "NAME"
                                      :source-name "PEOPLE"}]}]})]
      (is (=? [[:field {} (meta/id :orders :id)]
               [:field {} (meta/id :orders :total)]
               [:field {} (meta/id :people :name)]]
              (:fields (first (:stages query))))))))

(deftest ^:parallel test-query-with-expressions-test
  (testing "test-query adds expressions to the query"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source      {:type :table
                                          :id   (meta/id :venues)}
                            :expressions [{:name  "double-price"
                                           :value {:type     :operator
                                                   :operator :*
                                                   :args     [{:type :column
                                                               :name "PRICE"}
                                                              {:type  :literal
                                                               :value 2}]}}]}]})
          exprs (lib/expressions query 0)]
      (is (= 1 (count exprs)))
      (is (= "double-price" (-> exprs first lib.options/options :lib/expression-name))))))

(deftest ^:parallel test-query-with-filters-test
  (testing "test-query adds filters to the query"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source  {:type :table
                                      :id   (meta/id :venues)}
                            :filters [{:type     :operator
                                       :operator :>
                                       :args     [{:type :column
                                                   :name "PRICE"}
                                                  {:type  :literal
                                                   :value 3}]}]}]})]
      (is (=? [[:> {} [:field {} (meta/id :venues :price)] 3]]
              (lib/filters query))))))

(deftest ^:parallel test-query-with-aggregations-test
  (testing "test-query adds aggregations to the query"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source       {:type :table
                                           :id   (meta/id :venues)}
                            :aggregations [{:type     :operator
                                            :operator :count
                                            :args     []}]}]})]
      (is (=? [[:count {}]]
              (lib/aggregations query))))))

(deftest ^:parallel test-query-with-breakouts-test
  (testing "test-query adds breakouts to the query"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :venues)}
                            :breakouts [{:type :column
                                         :name "CATEGORY_ID"}]}]})]
      (is (=? [[:field {} (meta/id :venues :category-id)]]
              (lib/breakouts query))))))

(deftest ^:parallel test-query-with-temporal-bucket-breakout-test
  (testing "test-query adds breakouts with temporal bucketing"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :checkins)}
                            :breakouts [{:type :column
                                         :name "DATE"
                                         :unit :month}]}]})]
      (is (=? [[:field
                {:temporal-unit :month}
                (meta/id :checkins :date)]]
              (lib/breakouts query))))))

(deftest ^:parallel test-query-with-bin-count-breakout-test
  (testing "test-query adds breakouts with bin count binning"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :venues)}
                            :breakouts [{:type :column
                                         :name "PRICE"
                                         :bins 10}]}]})]
      (is (= 1 (count (lib/breakouts query))))
      (is (=? {:strategy :num-bins :num-bins 10}
              (-> query lib/breakouts first lib/binning))))))

(deftest ^:parallel test-query-with-bin-width-breakout-test
  (testing "test-query adds breakouts with bin width binning"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :venues)}
                            :breakouts [{:type      :column
                                         :name      "LATITUDE"
                                         :bin-width 20}]}]})]
      (is (= 1 (count (lib/breakouts query))))
      (is (=? {:strategy :bin-width :bin-width 20.0} (-> query lib/breakouts first second :binning))))))

(deftest ^:parallel test-query-with-order-bys-test
  (testing "test-query adds order-bys to the query"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :venues)}
                            :order-bys [{:type      :column
                                         :name      "PRICE"
                                         :direction :asc}]}]})]
      (is (=? [[:asc {} [:field {} (meta/id :venues :price)]]]
              (lib/order-bys query))))))

(deftest ^:parallel test-query-with-limit-test
  (testing "test-query adds a limit to the query"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :venues)}
                            :limit  100}]})]
      (is (= 100 (lib/current-limit query))))))

(deftest ^:parallel test-query-with-joins-test
  (testing "test-query adds joins to the query"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :venues)}
                            :joins  [{:source   {:type :table
                                                 :id   (meta/id :categories)}
                                      :strategy :left-join}]}]})]
      (is (=? [{:strategy :left-join}]
              (lib/joins query))))))

(deftest ^:parallel test-query-with-join-conditions-test
  (testing "test-query adds joins with explicit conditions"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :venues)}
                            :joins  [{:source     {:type :table
                                                   :id   (meta/id :categories)}
                                      :strategy   :left-join
                                      :conditions [{:operator :=
                                                    :left     {:type :column
                                                               :name "CATEGORY_ID"}
                                                    :right    {:type :column
                                                               :name "ID"}}]}]}]})]
      (is (= 1 (count (lib/joins query))))
      (is (= 1 (count (:conditions (first (lib/joins query)))))))))

(deftest ^:parallel test-query-with-join-conditions-with-binning-test
  (testing "test-query adds joins with binned conditions"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :checkins)}
                            :joins  [{:source     {:type :table
                                                   :id   (meta/id :checkins)}
                                      :strategy   :left-join
                                      :conditions [{:operator :=
                                                    :left     {:type :column
                                                               :name "DATE"
                                                               :unit :month}
                                                    :right    {:type :column
                                                               :name "DATE"
                                                               :unit :month}}]}]}]})]
      (is (= 1 (count (lib/joins query))))
      (is (=? [[:=
                {}
                [:field {:temporal-unit :month} (meta/id :checkins :date)]
                [:field {:temporal-unit :month} (meta/id :checkins :date)]]]
              (-> query lib/joins first :conditions))))))

(deftest ^:parallel test-query-multi-stage-test
  (testing "test-query handles multiple stages"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source       {:type :table
                                           :id   (meta/id :venues)}
                            :aggregations [{:type     :operator
                                            :operator :count
                                            :args     []}]
                            :breakouts    [{:type :column
                                            :name "CATEGORY_ID"}]}
                           {:filters [{:type     :operator
                                       :operator :>
                                       :args     [{:type :column
                                                   :name "count"}
                                                  {:type  :literal
                                                   :value 10}]}]}]})]
      (is (= 2 (count (:stages query))))
      (is (= 1 (count (lib/aggregations query 0))))
      (is (= 1 (count (lib/breakouts query 0))))
      (is (= 1 (count (lib/filters query 1)))))))

(deftest ^:parallel test-query-complex-expression-test
  (testing "test-query handles complex nested expressions"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source  {:type :table
                                      :id   (meta/id :venues)}
                            :filters [{:type     :operator
                                       :operator :and
                                       :args     [{:type     :operator
                                                   :operator :>
                                                   :args     [{:type :column
                                                               :name "PRICE"}
                                                              {:type  :literal
                                                               :value 2}]}
                                                  {:type     :operator
                                                   :operator :<
                                                   :args     [{:type :column
                                                               :name "PRICE"}
                                                              {:type  :literal
                                                               :value 4}]}]}]}]})]
      (is (= 1 (count (lib/filters query))))
      (is (=? [:and
               {}
               [:> {} [:field {} (meta/id :venues :price)] 2]
               [:< {} [:field {} (meta/id :venues :price)] 4]]
              (first (lib/filters query)))))))

(deftest ^:parallel test-query-column-with-source-name-test
  (testing "test-query can reference columns by source table name"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :venues)}
                            :fields [{:type        :column
                                      :name        "ID"
                                      :source-name "VENUES"}]}]})]
      (is (= 1 (count (:fields (first (:stages query))))))
      (is (=? [[:field {} (meta/id :venues :id)]]
              (:fields (first (:stages query))))))))

(deftest ^:parallel test-query-named-aggregation-test
  (testing "test-query handles named aggregations"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source       {:type :table
                                           :id   (meta/id :venues)}
                            :aggregations [{:name  "my-count"
                                            :value {:type     :operator
                                                    :operator :count
                                                    :args     []}}]}]})]
      (is (= 1 (count (lib/aggregations query))))
      (is (= "my-count" (lib/display-name query (first (lib/aggregations query))))))))

(deftest ^:parallel test-query-error-no-column-found-test
  (testing "test-query throws when column is not found"
    (is (thrown-with-msg?
         #?(:clj Exception :cljs js/Error)
         #"No column found"
         (lib.query.util/test-query
          meta/metadata-provider
          {:stages [{:source {:type :table
                              :id   (meta/id :venues)}
                     :fields [{:type :column
                               :name "NONEXISTENT"}]}]})))))

(deftest ^:parallel test-query-error-multiple-columns-found-test
  (testing "test-query throws when multiple columns match"
    ;; This test would need a scenario where the same column name appears multiple times
    ;; For example, after a join. Let's test this with a join scenario
    (is (thrown-with-msg?
         #?(:clj Exception :cljs js/Error)
         #"Multiple columns found"
         (lib.query.util/test-query
          meta/metadata-provider
          {:stages [{:source {:type :table
                              :id   (meta/id :venues)}
                     :joins  [{:source   {:type :table
                                          :id   (meta/id :categories)}
                               :strategy :left-join}]
                     :fields [{:type :column
                               :name "ID"}]}]})))))

(deftest ^:parallel test-query-aggregation-with-args-test
  (testing "test-query handles aggregations with column arguments"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source       {:type :table
                                           :id   (meta/id :venues)}
                            :aggregations [{:type     :operator
                                            :operator :sum
                                            :args     [{:type :column
                                                        :name "PRICE"}]}]}]})]
      (is (= 1 (count (lib/aggregations query))))
      (is (=? [:sum {} [:field {} (meta/id :venues :price)]]
              (first (lib/aggregations query)))))))

(deftest ^:parallel test-query-aggregation-avg-test
  (testing "test-query handles avg aggregations"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source       {:type :table
                                           :id   (meta/id :venues)}
                            :aggregations [{:type     :operator
                                            :operator :avg
                                            :args     [{:type :column
                                                        :name "PRICE"}]}]}]})]
      (is (= 1 (count (lib/aggregations query))))
      (is (=? [:avg {} [:field {} (meta/id :venues :price)]]
              (first (lib/aggregations query)))))))

(deftest ^:parallel test-query-named-aggregation-with-args-test
  (testing "test-query handles named aggregations with arguments"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source       {:type :table
                                           :id   (meta/id :venues)}
                            :aggregations [{:name  "total-price"
                                            :value {:type     :operator
                                                    :operator :sum
                                                    :args     [{:type :column
                                                                :name "PRICE"}]}}]}]})]
      (is (= 1 (count (lib/aggregations query))))
      (is (= "total-price" (lib/display-name query (first (lib/aggregations query)))))
      (is (=? [:sum {} [:field {} (meta/id :venues :price)]]
              (first (lib/aggregations query)))))))

(deftest ^:parallel test-query-with-join-card-source-test
  (testing "test-query supports joins with card sources"
    (let [query (lib.query.util/test-query
                 lib.tu/metadata-provider-with-card
                 {:stages [{:source {:type :table
                                     :id   (meta/id :venues)}
                            :joins  [{:source   {:type :card
                                                 :id   1}
                                      :strategy :left-join
                                      :conditions [{:operator :=
                                                    :left {:type :column
                                                           :name "ID"}
                                                    :right {:type :column
                                                            :name "USER_ID"}}]}]}]})]
      (is (=? [{:strategy :left-join}]
              (-> query lib/joins))))))

(deftest ^:parallel test-query-with-join-conditions-with-bin-width-test
  (testing "test-query adds joins with bin-width binned conditions"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :venues)}
                            :joins  [{:source     {:type :table
                                                   :id   (meta/id :venues)}
                                      :strategy   :left-join
                                      :conditions [{:operator  :=
                                                    :left      {:type      :column
                                                                :name      "LATITUDE"
                                                                :bin-width 20}
                                                    :right     {:type      :column
                                                                :name      "LONGITUDE"
                                                                :bin-width 20}}]}]}]})]
      (is (=? [{:lib/type   :mbql/join
                :strategy   :left-join
                :conditions [[:= {}
                              [:field {:join-alias (symbol "nil \"key is not present.\"")
                                       :binning    {:bin-width 20.0
                                                    :strategy  :bin-width}}
                               (meta/id :venues :latitude)]
                              [:field {:join-alias "Venues"
                                       :binning    {:bin-width 20.0
                                                    :strategy  :bin-width}}
                               (meta/id :venues :longitude)]]]}]
              (lib/joins query))))))

(deftest ^:parallel test-query-order-by-with-temporal-bucket-test
  (testing "test-query adds order-by with temporal bucketing"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :checkins)}
                            :order-bys [{:type      :column
                                         :name      "DATE"
                                         :unit      :month
                                         :direction :desc}]}]})]
      (is (= 1 (count (lib/order-bys query))))
      (is (=? [:desc {} [:field {:temporal-unit :month} (meta/id :checkins :date)]]
              (first (lib/order-bys query)))))))

(deftest ^:parallel test-query-order-by-with-binning-test
  (testing "test-query adds order-by with binning"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :venues)}
                            :order-bys [{:type      :column
                                         :name      "PRICE"
                                         :bins      10
                                         :direction :asc}]}]})]
      (is (= 1 (count (lib/order-bys query))))
      (is (=? [:asc {} [:field {:binning {:strategy :num-bins}} (meta/id :venues :price)]]
              (first (lib/order-bys query)))))))

(deftest ^:parallel test-query-expression-with-aggregation-test
  (testing "test-query handles expressions that reference aggregations in later stages"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source       {:type :table
                                           :id   (meta/id :venues)}
                            :aggregations [{:name  "total-price"
                                            :value {:type     :operator
                                                    :operator :sum
                                                    :args     [{:type :column
                                                                :name "PRICE"}]}}]
                            :breakouts    [{:type :column
                                            :name "CATEGORY_ID"}]}
                           {:expressions [{:name  "double-total"
                                           :value {:type     :operator
                                                   :operator :*
                                                   :args     [{:type :column
                                                               :name "total-price"}
                                                              {:type  :literal
                                                               :value 2}]}}]}]})]
      (is (= 2 (count (:stages query))))
      (is (= 1 (count (lib/aggregations query 0))))
      (is (= 1 (count (:expressions (second (:stages query)))))))))

(deftest ^:parallel test-query-multiple-filters-test
  (testing "test-query handles multiple independent filters"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source  {:type :table
                                      :id   (meta/id :venues)}
                            :filters [{:type     :operator
                                       :operator :>
                                       :args     [{:type :column
                                                   :name "PRICE"}
                                                  {:type  :literal
                                                   :value 2}]}
                                      {:type     :operator
                                       :operator :<
                                       :args     [{:type :column
                                                   :name "LATITUDE"}
                                                  {:type  :literal
                                                   :value 40}]}]}]})]
      (is (=? [[:> {} [:field {} (meta/id :venues :price)] 2]
               [:< {} [:field {} (meta/id :venues :latitude)] 40]]
              (-> query lib/filters))))))

(deftest ^:parallel test-query-multiple-joins-test
  (testing "test-query handles multiple joins"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :venues)}
                            :joins  [{:source   {:type :table
                                                 :id   (meta/id :categories)}
                                      :strategy :left-join}
                                     {:source   {:type :table
                                                 :id   (meta/id :checkins)}
                                      :strategy :left-join}]}]})]
      (is (= 2 (count (lib/joins query))))
      (is (= :left-join (-> query (lib/joins) first :strategy)))
      (is (= :left-join (-> query (lib/joins) second :strategy))))))

(deftest ^:parallel test-query-three-stage-test
  (testing "test-query handles three stages"
    (let [query (lib.query.util/test-query
                 meta/metadata-provider
                 {:stages [{:source       {:type :table
                                           :id   (meta/id :venues)}
                            :aggregations [{:type     :operator
                                            :operator :count
                                            :args     []}]
                            :breakouts    [{:type :column
                                            :name "CATEGORY_ID"}]}
                           {:filters [{:type     :operator
                                       :operator :>
                                       :args     [{:type :column
                                                   :name "count"}
                                                  {:type  :literal
                                                   :value 10}]}]}
                           {:limit 5}]})]
      (is (= 3 (count (:stages query))))
      (is (= 1 (count (lib/aggregations query 0))))
      (is (= 1 (count (lib/breakouts query 0))))
      (is (= 1 (count (lib/filters query 1))))
      (is (= 5 (lib/current-limit query 2))))))
