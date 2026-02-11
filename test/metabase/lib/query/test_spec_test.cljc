(ns metabase.lib.query.test-spec-test
  (:require
   #?@(:cljs
       [[metabase.test-runner.assert-exprs.approximately-equal]])
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.query.test-spec :as lib.query.test-spec]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def missing-value (symbol "nil #_\"key is not present.\""))

(deftest ^:parallel test-query-basic-table-source-test
  (testing "test-query creates a basic query from a table source"
    (let [query (lib.query.test-spec/test-query
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
    (let [query (lib.query.test-spec/test-query
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
    (let [query (lib.query.test-spec/test-query
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
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source      {:type :table
                                          :id   (meta/id :venues)}
                            :expressions [{:name  "double-price"
                                           :value {:type     :operator
                                                   :operator :*
                                                   :args     [{:type :column
                                                               :name "PRICE"}
                                                              {:type  :literal
                                                               :value 2}]}}
                                          {:name "half-price"
                                           :value {:type :operator
                                                   :operator :/
                                                   :args [{:type :column
                                                           :name "double-price"}
                                                          {:type :literal
                                                           :value 4}]}}]}]})]
      (is (=? [[:*
                {:lib/expression-name "double-price"}
                [:field {} (meta/id :venues :price)]
                2]
               [:/
                {:lib/expression-name "half-price"}
                [:expression {} "double-price"]
                4]]
              (lib/expressions query))))))

(deftest ^:parallel test-query-with-filters-test
  (testing "test-query adds filters to the query"
    (let [query (lib.query.test-spec/test-query
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
    (let [query (lib.query.test-spec/test-query
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
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :venues)}
                            :breakouts [{:type :column
                                         :name "CATEGORY_ID"}]}]})]
      (is (=? [[:field {} (meta/id :venues :category-id)]]
              (lib/breakouts query))))))

(deftest ^:parallel test-query-with-temporal-bucket-breakout-test
  (testing "test-query adds breakouts with temporal bucketing"
    (let [query (lib.query.test-spec/test-query
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
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :venues)}
                            :breakouts [{:type :column
                                         :name "PRICE"
                                         :bins 10}]}]})]
      (is (=? [[:field
                {:binning {:strategy :num-bins :num-bins 10}}
                (meta/id :venues :price)]]
              (lib/breakouts query))))))

(deftest ^:parallel test-query-with-bin-width-breakout-test
  (testing "test-query adds breakouts with bin width binning"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :venues)}
                            :breakouts [{:type      :column
                                         :name      "LATITUDE"
                                         :bin-width 20}]}]})]
      (is (=? [[:field
                {:binning {:strategy :bin-width :bin-width 20.0}}
                (meta/id :venues :latitude)]]
              (lib/breakouts query))))))

(deftest ^:parallel test-query-with-order-bys-test
  (testing "test-query adds order-bys to the query"
    (let [query (lib.query.test-spec/test-query
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
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :venues)}
                            :limit  100}]})]
      (is (= 100 (lib/current-limit query))))))

(deftest ^:parallel test-query-with-joins-test
  (testing "test-query adds joins to the query"
    (let [query (lib.query.test-spec/test-query
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
    (let [query (lib.query.test-spec/test-query
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
      (is (=? [{:alias "Categories"
                :strategy :left-join
                :conditions [[:= {}
                              [:field {:join-alias missing-value} (meta/id :venues :category-id)]
                              [:field {:join-alias "Categories"} (meta/id :categories :id)]]]}]
              (lib/joins query))))))

(deftest ^:parallel test-query-with-join-conditions-with-binning-test
  (testing "test-query adds joins with binned conditions"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :users)}
                            :joins  [{:source     {:type :table
                                                   :id   (meta/id :checkins)}
                                      :strategy   :left-join
                                      :conditions [{:operator :=
                                                    :left     {:type :column
                                                               :name "LAST_LOGIN"
                                                               :source-name "USERS"
                                                               :unit :month}
                                                    :right    {:type :column
                                                               :name "DATE"
                                                               :source-name "CHECKINS"
                                                               :unit :month}}]}]}]})]
      (is (=? [{:strategy :left-join
                :conditions [[:= {}
                              [:field {:temporal-unit :month :join-alias missing-value}
                               (meta/id :users :last-login)]
                              [:field {:temporal-unit :month :join-alias "Checkins - Last Login"}
                               (meta/id :checkins :date)]]]}]
              (lib/joins query))))))

(deftest ^:parallel test-query-multi-stage-test
  (testing "test-query handles multiple stages"
    (let [query (lib.query.test-spec/test-query
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
      (is (= 1 (count (lib/filters query 1))))
      (is (empty? (lib/filters query 0)))
      (is (empty? (lib/aggregations query 1)))
      (is (empty? (lib/breakouts query 1))))))

(deftest ^:parallel test-query-complex-expression-test
  (testing "test-query handles complex nested expressions"
    (let [query (lib.query.test-spec/test-query
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
      (is (=? [[:and
                {}
                [:> {} [:field {} (meta/id :venues :price)] 2]
                [:< {} [:field {} (meta/id :venues :price)] 4]]]
              (lib/filters query))))))

(deftest ^:parallel test-query-named-aggregation-test
  (testing "test-query handles named aggregations"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source       {:type :table
                                           :id   (meta/id :venues)}
                            :aggregations [{:name  "my-count"
                                            :value {:type     :operator
                                                    :operator :count
                                                    :args     []}}]}]})]
      (is (=? [[:count {:display-name "my-count"}]]
              (lib/aggregations query))))))

(deftest ^:parallel test-query-error-no-column-found-test
  (testing "test-query throws when column is not found"
    (is (thrown-with-msg?
         #?(:clj Exception :cljs js/Error)
         #"No column found"
         (lib.query.test-spec/test-query
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
         (lib.query.test-spec/test-query
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
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source       {:type :table
                                           :id   (meta/id :venues)}
                            :aggregations [{:type     :operator
                                            :operator :sum
                                            :args     [{:type :column
                                                        :name "PRICE"}]}]}]})]
      (is (=? [[:sum {} [:field {} (meta/id :venues :price)]]]
              (lib/aggregations query))))))

(deftest ^:parallel test-query-aggregation-avg-test
  (testing "test-query handles avg aggregations"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source       {:type :table
                                           :id   (meta/id :venues)}
                            :aggregations [{:type     :operator
                                            :operator :avg
                                            :args     [{:type :column
                                                        :name "PRICE"}]}]}]})]
      (is (=? [[:avg {} [:field {} (meta/id :venues :price)]]]
              (lib/aggregations query))))))

(deftest ^:parallel test-query-named-aggregation-with-args-test
  (testing "test-query handles named aggregations with arguments"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source       {:type :table
                                           :id   (meta/id :venues)}
                            :aggregations [{:name  "total-price"
                                            :value {:type     :operator
                                                    :operator :sum
                                                    :args     [{:type :column
                                                                :name "PRICE"}]}}]}]})]
      (is (=? [[:sum {:display-name "total-price"} [:field {} (meta/id :venues :price)]]]
              (lib/aggregations query))))))

(deftest ^:parallel test-query-with-join-card-source-test
  (testing "test-query supports joins with card sources"
    (let [query (lib.query.test-spec/test-query
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
    (let [query (lib.query.test-spec/test-query
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
                              [:field {:join-alias missing-value
                                       :binning    {:bin-width 20.0
                                                    :strategy  :bin-width}}
                               (meta/id :venues :latitude)]
                              [:field {:join-alias "Venues - Latitude"
                                       :binning    {:bin-width 20.0
                                                    :strategy  :bin-width}}
                               (meta/id :venues :longitude)]]]}]
              (lib/joins query))))))

(deftest ^:parallel test-query-order-by-with-temporal-bucket-test
  (testing "test-query adds order-by with temporal bucketing"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :checkins)}
                            :order-bys [{:type      :column
                                         :name      "DATE"
                                         :unit      :month
                                         :direction :desc}]}]})]
      (is (=? [[:desc {}
                [:field {:temporal-unit :month} (meta/id :checkins :date)]]]
              (lib/order-bys query))))))

(deftest ^:parallel test-query-order-by-with-temporal-bucket-test-with-duplicate-column
  (testing "test-query adds order-by with temporal bucketing when selecting the first column"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :checkins)}
                            :breakouts [{:type :column
                                         :name "DATE"
                                         :unit :month}
                                        {:type :column
                                         :name "DATE"
                                         :unit :year}]
                            :order-bys [{:type         :column
                                         :name         "DATE"
                                         :display-name "Date: Month"
                                         :direction    :desc}]}]})]
      (is (=? [[:desc {}
                [:field {:temporal-unit :month} (meta/id :checkins :date)]]]
              (lib/order-bys query)))))

  (testing "test-query adds order-by with temporal bucketing when selecting the second column"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :checkins)}
                            :breakouts [{:type :column
                                         :name "DATE"
                                         :unit :month}
                                        {:type :column
                                         :name "DATE"
                                         :unit :year}]
                            :order-bys [{:type         :column
                                         :name         "DATE"
                                         :display-name "Date: Year"
                                         :direction     :desc}]}]})]
      (is (=? [[:desc {}
                [:field {:temporal-unit :year} (meta/id :checkins :date)]]]
              (lib/order-bys query))))))

(deftest ^:parallel test-query-order-by-with-binning-test
  (testing "test-query adds order-by with binning"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source    {:type :table
                                        :id   (meta/id :venues)}
                            :order-bys [{:type      :column
                                         :name      "PRICE"
                                         :bins      10
                                         :direction :asc}]}]})]
      (is (=? [[:asc {} [:field {:binning {:strategy :num-bins}} (meta/id :venues :price)]]]
              (lib/order-bys query))))))

(deftest ^:parallel test-query-expression-with-aggregation-test
  (testing "test-query handles expressions that reference aggregations from earlier stages"
    (let [query (lib.query.test-spec/test-query
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
      (is (= 1 (count (lib/expressions query 1)))))))

(deftest ^:parallel test-query-multiple-filters-test
  (testing "test-query handles multiple independent filters"
    (let [query (lib.query.test-spec/test-query
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
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :venues)}
                            :joins  [{:source   {:type :table
                                                 :id   (meta/id :categories)}
                                      :strategy :left-join}
                                     {:source   {:type :table
                                                 :id   (meta/id :checkins)}
                                      :strategy :right-join}]}]})]
      (is (=? [{:strategy :left-join
                :alias "Categories"}
               {:strategy :right-join
                :alias "Checkins"}]
              (lib/joins query))))))

(deftest ^:parallel test-query-multiple-dependent-joins-test
  (testing "test-query handles multiple joins"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :orders)}
                            :joins  [{:source   {:type :table
                                                 :id   (meta/id :products)}
                                      :strategy :left-join}
                                     {:source   {:type :table
                                                 :id   (meta/id :reviews)}
                                      :strategy :right-join
                                      :conditions [{:operator :=
                                                    :left {:type :column
                                                           :name "ID"
                                                           :source-name "PRODUCTS"}
                                                    :right {:type :column
                                                            :name "PRODUCT_ID"}}]}]}]})]

      (is (=? [{:strategy :left-join
                :alias "Products"}
               {:strategy :right-join
                :alias "Reviews"
                :conditions [[:= {}
                              [:field {:join-alias "Products"} (meta/id :products :id)]
                              [:field {:join-alias "Reviews"} (meta/id :reviews :product-id)]]]}]
              (lib/joins query))))))

(deftest ^:parallel test-query-with-implicit-join-test
  (testing "test-query handles implicit joins in most clauses"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [{:source {:type :table
                                     :id   (meta/id :orders)}
                            :filters [{:type     :operator
                                       :operator :=
                                       :args     [{:type :literal
                                                   :value "Gadget"}
                                                  {:type :column
                                                   :source-name "PRODUCTS"
                                                   :name "CATEGORY"}]}]

                            :aggregations [{:type     :operator
                                            :operator :sum
                                            :args     [{:type :column
                                                        :source-name "PRODUCTS"
                                                        :name "PRICE"}]}]
                            :breakouts    [{:type :column
                                            :source-name "PRODUCTS"
                                            :name "CREATED_AT"}]

                            :expressions [{:name  "Custom"
                                           :value {:type     :operator
                                                   :operator :+
                                                   :args [{:type :literal
                                                           :value 42}
                                                          {:type :column
                                                           :name "PRICE"}]}}]}]})]

      (is (=? [[:=
                {} "Gadget"
                [:field
                 {:source-field (meta/id :orders :product-id)}
                 (meta/id :products :category)]]]
              (lib/filters query)))

      (is (=? [[:sum {}
                [:field
                 {:source-field (meta/id :orders :product-id)}
                 (meta/id :products :price)]]]
              (lib/aggregations query)))

      (is (=? [[:+
                {:lib/expression-name "Custom"}
                42
                [:field
                 {:source-field (meta/id :orders :product-id)}
                 (meta/id :products :price)]]]
              (lib/expressions query)))

      (is (=? [[:field
                {:source-field (meta/id :orders :product-id)}
                (meta/id :products :created-at)]]
              (lib/breakouts query)))

      (let [query (lib.query.test-spec/test-query
                   meta/metadata-provider
                   {:stages [{:source {:type :table
                                       :id   (meta/id :orders)}
                              :order-bys [{:type :column
                                           :name "PRICE"}]}]})]

        (is (=? [[:asc {} [:field
                           {:source-field (meta/id :orders :product-id)}
                           (meta/id :products :price)]]]
                (lib/order-bys query)))))))

(deftest ^:parallel test-query-three-stage-test
  (testing "test-query handles three stages"
    (let [query (lib.query.test-spec/test-query
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

#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest ^:parallel test-query-comprehensive-all-features-test
  (testing "test-query exercises all functionality in a comprehensive multi-stage query"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [;; Stage 0
                           {:source {:type :table
                                     :id   (meta/id :orders)}

                            :joins [{:source   {:type :table
                                                :id   (meta/id :products)}
                                     :strategy :left-join}
                                    {:source     {:type :table
                                                  :id   (meta/id :people)}
                                     :strategy   :inner-join
                                     :conditions [{:operator :=
                                                   :left     {:type :column
                                                              :name "USER_ID"}
                                                   :right    {:type :column
                                                              :name "ID"}}]}]

                            :expressions [{:name  "discounted-price"
                                           :value {:type     :operator
                                                   :operator :*
                                                   :args     [{:type :column
                                                               :name "PRICE"
                                                               :source-name "PRODUCTS"}
                                                              {:type  :literal
                                                               :value 0.9}]}}
                                          {:name  "double-discount"
                                           :value {:type     :operator
                                                   :operator :/
                                                   :args     [{:type :column
                                                               :name "discounted-price"}
                                                              {:type  :literal
                                                               :value 2}]}}]

                            :filters [{:type     :operator
                                       :operator :and
                                       :args     [{:type     :operator
                                                   :operator :>
                                                   :args     [{:type :column
                                                               :name "TOTAL"}
                                                              {:type  :literal
                                                               :value 50}]}
                                                  {:type     :operator
                                                   :operator :or
                                                   :args     [{:type     :operator
                                                               :operator :=
                                                               :args     [{:type :column
                                                                           :name "CATEGORY"
                                                                           :source-name "PRODUCTS"}
                                                                          {:type  :literal
                                                                           :value "Widget"}]}
                                                              {:type     :operator
                                                               :operator :<
                                                               :args     [{:type :column
                                                                           :name "double-discount"}
                                                                          {:type  :literal
                                                                           :value 10}]}]}]}]

                            :aggregations [{:name  "total-count"
                                            :value {:type     :operator
                                                    :operator :count
                                                    :args     []}}
                                           {:name  "total-revenue"
                                            :value {:type     :operator
                                                    :operator :sum
                                                    :args     [{:type :column
                                                                :name "TOTAL"}]}}
                                           {:type     :operator
                                            :operator :avg
                                            :args     [{:type :column
                                                        :name "PRICE"
                                                        :source-name "PRODUCTS"}]}]

                            :breakouts [{:type        :column
                                         :name        "CREATED_AT"
                                         :source-name "ORDERS"
                                         :unit        :month}
                                        {:type :column
                                         :name "QUANTITY"
                                         :bins 10}]

                            :order-bys [{:type        :column
                                         :name        "CREATED_AT"
                                         :source-name "ORDERS"
                                         :direction   :desc}]}

                           ;; Stage 1
                           {:expressions [{:name  "doubled-count"
                                           :value {:type     :operator
                                                   :operator :*
                                                   :args     [{:type :column
                                                               :name "total-count"}
                                                              {:type  :literal
                                                               :value 2}]}}]

                            :filters [{:type     :operator
                                       :operator :>
                                       :args     [{:type :column
                                                   :name "total-revenue"}
                                                  {:type  :literal
                                                   :value 1000}]}]

                            :order-bys [{:type      :column
                                         :name      "total-revenue"
                                         :direction :asc}]}

                           ;; Stage 2
                           {:filters [{:type     :operator
                                       :operator :<
                                       :args     [{:type :column
                                                   :name "doubled-count"}
                                                  {:type  :literal
                                                   :value 500}]}]

                            :limit 25}]})]

      (is (= 3 (lib/stage-count query)))

      ;; Stage 0
      (is (=? [{:strategy :left-join
                :alias "Products"}
               {:strategy :inner-join
                :alias "People - User"}]
              (lib/joins query 0)))

      (is (=? [[:* {:lib/expression-name "discounted-price"} [:field {} (meta/id :products :price)] 0.9]
               [:/ {:lib/expression-name "double-discount"} [:expression {} "discounted-price"] 2]]
              (lib/expressions query 0)))

      (is (empty? (lib/fields query 0)))

      (is (=? [[:and {}
                [:> {} [:field {} (meta/id :orders :total)] 50]
                [:or {}
                 [:= {} [:field {:join-alias "Products"} (meta/id :products :category)] "Widget"]
                 [:< {} [:expression {} "double-discount"] 10]]]]
              (lib/filters query 0)))

      (is (=? [[:count {:display-name "total-count"}]
               [:sum {:display-name "total-revenue"} [:field {} (meta/id :orders :total)]]
               [:avg {} [:field {:join-alias "Products"} (meta/id :products :price)]]]
              (lib/aggregations query 0)))

      (is (=? [[:field {:temporal-unit :month} (meta/id :orders :created-at)]
               [:field {:binning {:strategy :num-bins :num-bins 10}} (meta/id :orders :quantity)]]
              (lib/breakouts query 0)))

      (is (=? [[:desc {} [:field {:temporal-unit :month} (meta/id :orders :created-at)]]]
              (lib/order-bys query 0)))

      ;; Stage 1
      (is (=? [[:* {:lib/expression-name "doubled-count"}
                [:field {} "total-count"]
                2]]
              (lib/expressions query 1)))

      (is (=? [[:> {} [:field {} "total-revenue"] 1000]]
              (lib/filters query 1)))

      (is (=? [[:asc {} [:field {} "total-revenue"]]]
              (lib/order-bys query 1)))

      (is (empty? (lib/fields query 1)))

      ;; Stage 2
      (is (=? [[:< {} [:field {} "doubled-count"] 500]]
              (lib/filters query 2)))

      (is (empty? (lib/fields query 2)))

      (is (= 25 (lib/current-limit query 2))))))

#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest ^:parallel test-query-comprehensive-all-features-test-with-fields
  (testing "test-query exercises all functionality in a comprehensive multi-stage query, with fields clause"
    (let [query (lib.query.test-spec/test-query
                 meta/metadata-provider
                 {:stages [;; Stage 0
                           {:source {:type :table
                                     :id   (meta/id :orders)}

                            :joins [{:source   {:type :table
                                                :id   (meta/id :products)}
                                     :strategy :left-join}
                                    {:source     {:type :table
                                                  :id   (meta/id :people)}
                                     :strategy   :inner-join
                                     :conditions [{:operator :=
                                                   :left     {:type :column
                                                              :name "USER_ID"}
                                                   :right    {:type :column
                                                              :name "ID"}}]}]

                            :expressions [{:name  "discounted-price"
                                           :value {:type     :operator
                                                   :operator :*
                                                   :args     [{:type :column
                                                               :name "PRICE"
                                                               :source-name "PRODUCTS"}
                                                              {:type  :literal
                                                               :value 0.9}]}}
                                          {:name  "double-discount"
                                           :value {:type     :operator
                                                   :operator :/
                                                   :args     [{:type :column
                                                               :name "discounted-price"}
                                                              {:type  :literal
                                                               :value 2}]}}]

                            :filters [{:type     :operator
                                       :operator :and
                                       :args     [{:type     :operator
                                                   :operator :>
                                                   :args     [{:type :column
                                                               :name "TOTAL"}
                                                              {:type  :literal
                                                               :value 50}]}
                                                  {:type     :operator
                                                   :operator :or
                                                   :args     [{:type     :operator
                                                               :operator :=
                                                               :args     [{:type :column
                                                                           :name "CATEGORY"
                                                                           :source-name "PRODUCTS"}
                                                                          {:type  :literal
                                                                           :value "Widget"}]}
                                                              {:type     :operator
                                                               :operator :<
                                                               :args     [{:type :column
                                                                           :name "double-discount"}
                                                                          {:type  :literal
                                                                           :value 10}]}]}]}]

                            :order-bys [{:type        :column
                                         :name        "CREATED_AT"
                                         :source-name "ORDERS"
                                         :direction   :desc}]

                            :fields [{:type :column
                                      :name "TOTAL"}
                                     {:type :column
                                      :name "CATEGORY"
                                      :source-name "PRODUCTS"}
                                     {:type :column
                                      :name "double-discount"}]}

                           ;; Stage 1
                           {:expressions [{:name  "half-discount"
                                           :value {:type     :operator
                                                   :operator :/
                                                   :args     [{:type :column
                                                               :name "double-discount"}
                                                              {:type  :literal
                                                               :value 4}]}}]

                            :filters [{:type     :operator
                                       :operator :>
                                       :args     [{:type :column
                                                   :name "half-discount"}
                                                  {:type  :literal
                                                   :value 1000}]}]}

                           ;; Stage 2
                           {:filters [{:type     :operator
                                       :operator :<
                                       :args     [{:type :column
                                                   :name "half-discount"}
                                                  {:type  :literal
                                                   :value 500}]}]

                            :limit 25}]})]

      (is (= 3 (lib/stage-count query)))

      ;; Stage 0
      (is (=? [{:strategy :left-join
                :alias "Products"}
               {:strategy :inner-join
                :alias "People - User"}]
              (lib/joins query 0)))

      (is (=? [[:* {:lib/expression-name "discounted-price"} [:field {} (meta/id :products :price)] 0.9]
               [:/ {:lib/expression-name "double-discount"} [:expression {} "discounted-price"] 2]]
              (lib/expressions query 0)))

      (is (=? [[:field {} (meta/id :orders :total)]
               [:field {:join-alias "Products"} (meta/id :products :category)]
               [:expression {} "double-discount"]
               [:expression {} "discounted-price"]]
              (lib/fields query 0)))

      (is (=? [[:and {}
                [:> {} [:field {} (meta/id :orders :total)] 50]
                [:or {}
                 [:= {} [:field {:join-alias "Products"} (meta/id :products :category)] "Widget"]
                 [:< {} [:expression {} "double-discount"] 10]]]]
              (lib/filters query 0)))

      (is (empty? (lib/aggregations query 0)))
      (is (empty? (lib/breakouts query 0)))

      (is (=? [[:desc {} [:field {} (meta/id :orders :created-at)]]]
              (lib/order-bys query 0)))

      ;; Stage 1
      (is (=? [[:/ {:lib/expression-name "half-discount"}
                [:field {} "double-discount"]
                4]]
              (lib/expressions query 1)))

      (is (=? [[:> {} [:expression {} "half-discount"] 1000]]
              (lib/filters query 1)))

      (is (empty? (lib/order-bys query 1)))
      (is (empty? (lib/fields query 1)))

      ;; Stage 2
      (is (=? [[:< {} [:field {} "half-discount"] 500]]
              (lib/filters query 2)))

      (is (empty? (lib/fields query 2)))

      (is (= 25 (lib/current-limit query 2))))))

(deftest ^:parallel test-native-query-basic-test
  (testing "test-native-query creates a basic native query without template tags"
    (let [query (lib.query.test-spec/test-native-query
                 meta/metadata-provider
                 {:database-id (meta/id)
                  :query "SELECT * FROM orders"})]
      (is (=? (lib/raw-native-query query)
              "SELECT * FROM orders"))
      (is (empty? (lib/template-tags query))))))

(deftest ^:parallel test-native-query-with-text-tag-test
  (testing "test-native-query creates a native query with text template tag"
    (let [query (lib.query.test-spec/test-native-query
                 meta/metadata-provider
                 {:database-id    (meta/id)
                  :query          "SELECT * FROM venues WHERE name = {{venue_name}}"
                  :template-tags  {"venue_name" {:type         :text
                                                 :name         "venue_name"
                                                 :display-name "Venue Name"}}})]
      (is (=? (lib/raw-native-query query)
              "SELECT * FROM venues WHERE name = {{venue_name}}"))

      (is (=? {"venue_name" {:type         :text
                             :name         "venue_name"
                             :display-name "Venue Name"}}
              (lib/template-tags query))))))

(deftest ^:parallel test-native-query-with-number-tag-test
  (testing "test-native-query creates a native query with number template tag"
    (let [query (lib.query.test-spec/test-native-query
                 meta/metadata-provider
                 {:database-id    (meta/id)
                  :query          "SELECT * FROM venues WHERE price = {{price}}"
                  :template-tags  {"price" {:type         :number
                                            :name         "price"
                                            :display-name "Price"}}})]
      (is (=? (lib/raw-native-query query)
              "SELECT * FROM venues WHERE price = {{price}}"))
      (is (=? {"price" {:type         :number
                        :name         "price"
                        :display-name "Price"}}
              (lib/template-tags query))))))

(deftest ^:parallel test-native-query-with-date-tag-test
  (testing "test-native-query creates a native query with date template tag"
    (let [query (lib.query.test-spec/test-native-query
                 meta/metadata-provider
                 {:database-id    (meta/id)
                  :query          "SELECT * FROM orders WHERE created_at = {{date}}"
                  :template-tags  {"date" {:type         :date
                                           :name         "date"
                                           :display-name "Date"}}})]
      (is (=? (lib/raw-native-query query)
              "SELECT * FROM orders WHERE created_at = {{date}}"))
      (is (=? {"date" {:type         :date
                       :name         "date"
                       :display-name "Date"}}
              (lib/template-tags query))))))

(deftest ^:parallel test-native-query-with-boolean-tag-test
  (testing "test-native-query creates a native query with boolean template tag"
    (let [query (lib.query.test-spec/test-native-query
                 meta/metadata-provider
                 {:database-id    (meta/id)
                  :query          "SELECT * FROM users WHERE active = {{is_active}}"
                  :template-tags  {"is_active" {:type         :boolean
                                                :name         "is_active"
                                                :display-name "Is Active"}}})]
      (is (=? (lib/raw-native-query query)
              "SELECT * FROM users WHERE active = {{is_active}}"))

      (is (=? {"is_active" {:type         :boolean
                            :name         "is_active"
                            :display-name "Is Active"}}
              (lib/template-tags query))))))

(deftest ^:parallel test-native-query-with-dimension-tag-test
  (testing "test-native-query creates a native query with dimension (field-filter) template tag"
    (let [query (lib.query.test-spec/test-native-query
                 meta/metadata-provider
                 {:database-id    (meta/id)
                  :query          "SELECT * FROM venues WHERE {{category_filter}}"
                  :template-tags  {"category_filter" {:type         :dimension
                                                      :name         "category_filter"
                                                      :display-name "Category Filter"
                                                      :dimension    (meta/id :venues :category-id)
                                                      :widget-type  :text}}})]
      (is (=? (lib/raw-native-query query)
              "SELECT * FROM venues WHERE {{category_filter}}"))

      (is (=? {"category_filter" {:type         :dimension
                                  :name         "category_filter"
                                  :display-name "Category Filter"
                                  :dimension    [:field {} (meta/id :venues :category-id)]
                                  :widget-type  :text}}
              (lib/template-tags query))))))

(deftest ^:parallel test-native-query-with-temporal-unit-tag-test
  (testing "test-native-query creates a native query with temporal-unit template tag"
    (let [query (lib.query.test-spec/test-native-query
                 meta/metadata-provider
                 {:database-id    (meta/id)
                  :query          "SELECT * FROM orders WHERE {{date_unit}}"
                  :template-tags  {"date_unit" {:type         :temporal-unit
                                                :name         "date_unit"
                                                :display-name "Date Unit"
                                                :dimension    (meta/id :orders :created-at)}}})]
      (is (=? (lib/raw-native-query query)
              "SELECT * FROM orders WHERE {{date_unit}}"))

      (is (=? {"date_unit" {:type         :temporal-unit
                            :name         "date_unit"
                            :display-name "Date Unit"
                            :dimension    [:field {} (meta/id :orders :created-at)]}}
              (lib/template-tags query))))))

(deftest ^:parallel test-native-query-with-snippet-tag-test
  (testing "test-native-query creates a native query with snippet template tag"
    (let [query (lib.query.test-spec/test-native-query
                 meta/metadata-provider
                 {:database-id    (meta/id)
                  :query          "SELECT * FROM {{snippet: my-snippet}}"
                  :template-tags  {"snippet: my-snippet" {:type         :snippet
                                                          :name         "snippet: my-snippet"
                                                          :display-name "My Snippet"
                                                          :snippet-name "my-snippet"}}})]
      (is (=? (lib/raw-native-query query)
              "SELECT * FROM {{snippet: my-snippet}}"))

      (is (=? {"snippet: my-snippet" {:type         :snippet
                                      :name         "snippet: my-snippet"
                                      :display-name "My Snippet"
                                      :snippet-name "my-snippet"}}
              (lib/template-tags query))))))

(deftest ^:parallel test-native-query-with-card-tag-test
  (testing "test-native-query creates a native query with card (source-query) template tag"
    (let [query (lib.query.test-spec/test-native-query
                 lib.tu/metadata-provider-with-card
                 {:database-id    (meta/id)
                  :query          "SELECT * FROM {{#123}}"
                  :template-tags  {"#123" {:type         :card
                                           :name         "#123"
                                           :display-name "Card 123"
                                           :card-id      1}}})]
      (is (=? (lib/raw-native-query query)
              "SELECT * FROM {{#123}}"))

      (is (=? {"#123" {:type         :card
                       :name         "#123"
                       :display-name "Card 123"
                       :card-id      1}}
              (lib/template-tags query))))))

(deftest ^:parallel test-native-query-with-multiple-tags-test
  (testing "test-native-query creates a native query with multiple template tags"
    (let [query (lib.query.test-spec/test-native-query
                 meta/metadata-provider
                 {:database-id    (meta/id)
                  :query          "SELECT * FROM venues WHERE name = {{name}} AND price > {{min_price}} AND {{category_filter}}"
                  :template-tags  {"name"            {:type         :text
                                                      :name         "name"
                                                      :display-name "Name"}
                                   "min_price"       {:type         :number
                                                      :name         "min_price"
                                                      :display-name "Min Price"}
                                   "category_filter" {:type         :dimension
                                                      :name         "category_filter"
                                                      :display-name "Category Filter"
                                                      :dimension    (meta/id :venues :category-id)
                                                      :widget-type  :text}}})]
      (is (=? (lib/raw-native-query query)
              "SELECT * FROM venues WHERE name = {{name}} AND price > {{min_price}} AND {{category_filter}}"))

      (is (=? {"name"            {:type         :text
                                  :name         "name"
                                  :display-name "Name"}
               "min_price"       {:type         :number
                                  :name         "min_price"
                                  :display-name "Min Price"}
               "category_filter" {:type         :dimension
                                  :name         "category_filter"
                                  :display-name "Category Filter"
                                  :dimension    [:field {} (meta/id :venues :category-id)]
                                  :widget-type  :text}}
              (lib/template-tags query))))))

(deftest ^:parallel test-native-query-inferred-tags-test
  (testing "test-native-query infers template tags from query text"
    (let [query (lib.query.test-spec/test-native-query
                 meta/metadata-provider
                 {:database-id    (meta/id)
                  :query          "SELECT * FROM venues WHERE name = {{venue_name}}"
                  :template-tags  {"venue_name" {:type         :text
                                                 :display-name "Custom Name"
                                                 :default      "Foo"
                                                 :widget-type  "string/contains"
                                                 :required     true}}})]
      (is (=? (lib/raw-native-query query)
              "SELECT * FROM venues WHERE name = {{venue_name}}"))

      (is (=? {"venue_name" {:type         :text
                             :name         "venue_name"
                             :display-name "Custom Name"
                             :default      "Foo"
                             :required     true
                             :widget-type  "string/contains"
                             :id           string?}}
              (lib/template-tags query))))))

(deftest ^:parallel test-native-query-empty-template-tags-test
  (testing "test-native-query handles explicit empty template tags"
    (let [query (lib.query.test-spec/test-native-query
                 meta/metadata-provider
                 {:database-id    (meta/id)
                  :query          "SELECT * FROM orders"
                  :template-tags  {}})]
      (is (=? (lib/raw-native-query query)
              "SELECT * FROM orders"))
      (is (empty? (lib/template-tags query))))))
