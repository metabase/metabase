(ns metabase.lib.remove-replace-test
  (:require
   #?(:cljs [metabase.test-runner.assert-exprs.approximately-equal])
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel remove-clause-order-bys-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/order-by (meta/field-metadata :venues :name))
                  (lib/order-by (meta/field-metadata :venues :price)))
        order-bys (lib/order-bys query)]
    (is (= 2 (count order-bys)))
    (is (= 1 (-> query
                 (lib/remove-clause (first order-bys))
                 (lib/order-bys)
                 count)))
    (is (nil? (-> query
                  (lib/remove-clause (first order-bys))
                  (lib/remove-clause (second order-bys))
                  (lib/order-bys))))))

(deftest ^:parallel remove-clause-filters-test
  (lib.tu.macros/with-testing-against-standard-queries query
    (let [query (-> query
                    (lib/filter (lib/= (meta/field-metadata :venues :price) 4))
                    (lib/filter (lib/= (meta/field-metadata :venues :name) "x")))
          filters (lib/filters query)]
      (is (= 2 (count filters)))
      (is (= 1 (-> query
                   (lib/remove-clause (first filters))
                   (lib/filters)
                   count)))
      (is (nil? (-> query
                    (lib/remove-clause (first filters))
                    (lib/remove-clause (second filters))
                    (lib/filters)))))))

(deftest ^:parallel remove-clause-join-conditions-test
  (testing "directly removing the final join condition throws an exception"
    (let [query (-> (lib.tu/venues-query)
                    (lib/join (lib/join-clause (lib/query meta/metadata-provider (meta/table-metadata :categories))
                                               [(lib/= (meta/field-metadata :venues :price) 4)
                                                (lib/= (meta/field-metadata :venues :name) "x")])))
          conditions (lib/join-conditions (first (lib/joins query)))]
      (is (= 2 (count conditions)))
      (is (= [(second conditions)]
             (-> query
                 (lib/remove-clause (first conditions))
                 lib/joins
                 first
                 lib/join-conditions)))
      (is (thrown-with-msg?
           #?(:clj Exception :cljs js/Error)
           #"Cannot remove the final join condition"
           (-> query
               (lib/remove-clause (first conditions))
               (lib/remove-clause (second conditions)))))))

  (testing "a cascading delete that removes the final join condition should remove the whole join (#36690)"
    (let [base   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                     (lib/join (lib/join-clause (meta/table-metadata :products)
                                                [(lib/= (meta/field-metadata :orders :product-id)
                                                        (meta/field-metadata :products :id))]))
                     (lib/aggregate (lib/count))
                     (lib/breakout (meta/field-metadata :products :id))
                     lib/append-stage)
          cols   (lib/returned-columns base)
          id     (first cols)
          query  (lib/join base (lib/join-clause (meta/table-metadata :reviews)
                                                 [(lib/= id (meta/field-metadata :reviews :product-id))]))]
      (is (=? {:stages [{:joins       [{:conditions [[:= {} vector? vector?]]}]
                         :aggregation [[:count {}]]
                         :breakout    [[:field {} int?]]}
                        {:joins       [{:conditions [[:= {} vector? vector?]]}]
                         :aggregation (symbol "nil #_\"key is not present.\"")
                         :breakout    (symbol "nil #_\"key is not present.\"")}]}
              query))
      (is (=? {:stages [{:joins       [{:conditions [[:= {} vector? vector?]]}]
                         :aggregation [[:count {}]]
                         :breakout    (symbol "nil #_\"key is not present.\"")}
                        {:joins (symbol "nil #_\"key is not present.\"")}]}
              (lib/remove-clause query 0 (first (lib/breakouts query 0))))))))

(deftest ^:parallel remove-clause-breakout-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/aggregate (lib/count))
                  (lib/breakout (meta/field-metadata :venues :id))
                  (lib/breakout (meta/field-metadata :venues :name)))
        breakouts (lib/breakouts query)]
    (is (= 2 (count breakouts)))
    (is (=? [{:display-name "ID"}
             {:display-name "Name"}
             {:display-name "Count"}]
            (lib/returned-columns query)))
    (let [query'  (lib/remove-clause query (first breakouts))
          query'' (lib/remove-clause query' (second breakouts))]
      (is (= 1 (-> query' lib/breakouts count)))
      (is (=? [{:display-name "Name"}
               {:display-name "Count"}]
              (lib/returned-columns query')))
      (is (nil? (lib/breakouts query'')))
      (is (=? [{:display-name "Count"}]
              (lib/returned-columns query''))))
    (testing "removing with dependent should cascade"
      (is (=? {:stages [{:breakout [(second breakouts)]} (complement :filters)]}
              (-> query
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                  (lib/remove-clause 0 (first breakouts)))))
      (is (=? {:stages [{:breakout [(second breakouts)]}
                        (complement :fields)
                        (complement :filters)]}
              (-> query
                  (lib/append-stage)
                  (lib/with-fields [[:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"]])
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                  (lib/remove-clause 0 (first breakouts)))))
      (is (nil? (-> query
                    (lib/remove-clause 0 (second breakouts))
                    (lib/append-stage)
                    (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                    (lib/remove-clause 0 (first breakouts))
                    (lib/breakouts 0)))))))

(deftest ^:parallel remove-clause-fields-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/expression "myadd" (lib/+ 1 (meta/field-metadata :venues :category-id)))
                  (lib/with-fields [(meta/field-metadata :venues :id) (meta/field-metadata :venues :name)]))
        fields (lib/fields query)]
    (is (= 3 (count fields)))
    (is (= 2 (-> query
                 (lib/remove-clause (first fields))
                 (lib/fields)
                 count)))
    (is (nil? (-> query
                  (lib/remove-clause (first fields))
                  (lib/remove-clause (second fields))
                  (lib/fields))))
    (testing "removing with dependent should cascade"
      (is (=? {:stages [{:fields (rest fields)} (complement :filters)]}
              (-> query
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                  (lib/remove-clause 0 (first fields)))))
      (is (=? {:stages [{:fields (rest fields)}
                        (complement :fields)
                        (complement :filters)]}
              (-> query
                  (lib/append-stage)
                  (lib/with-fields [[:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"]])
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                  (lib/remove-clause 0 (first fields)))))
      (is (nil? (-> query
                    (lib/remove-clause 0 (second fields))
                    (lib/append-stage)
                    (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                    (lib/remove-clause 0 (first fields))
                    (lib/fields 0)))))))

(deftest ^:parallel remove-clause-join-fields-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :categories))
                  (lib/join (-> (lib/join-clause (lib.tu/venues-query)
                                                 [(lib/= (meta/field-metadata :venues :price) 4)])
                                (lib/with-join-fields [(meta/field-metadata :venues :price)
                                                       (meta/field-metadata :venues :id)]))))
        fields (lib/join-fields (first (lib/joins query)))]
    (is (= 2 (count fields)))
    (is (= [(second fields)]
           (-> query
               (lib/remove-clause (first fields))
               lib/joins
               first
               lib/join-fields)))
    (is (nil? (-> query
                  (lib/remove-clause (first fields))
                  (lib/remove-clause (second fields))
                  lib/joins
                  first
                  lib/join-fields)))
    (testing "removing with dependent should cascade"
      (is (=? {:stages [{:joins [{:fields [(second fields)]}]} (complement :filters)]}
              (-> query
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "Venues__PRICE"] 1))
                  (lib/remove-clause 0 (first fields)))))
      (is (=? {:stages [{:joins [{:fields [(second fields)]}]} (complement :fields) (complement :filters)]}
              (-> query
                  (lib/append-stage)
                  (lib/with-fields [[:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "Venues__PRICE"]])
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "Venues__PRICE"] 1))
                  (lib/remove-clause 0 (first fields))))))))

(deftest ^:parallel replace-clause-join-with-all-fields-test
  (testing "Joins with :all fields selected can be handled (#31858)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :categories))
                    (lib/breakout (meta/field-metadata :categories :id))
                    (lib/aggregate (lib/sum (meta/field-metadata :categories :id)))
                    (lib/join (-> (lib/join-clause (lib.tu/venues-query)
                                                   [(lib/= (meta/field-metadata :venues :category-id)
                                                           (meta/field-metadata :categories :id))])
                                  (lib/with-join-fields :all))))
          query' (lib/order-by query (lib/aggregation-ref query 0))
          aggs (lib/aggregations query')]
      (is (=? {:lib/type :mbql/query
               :stages
               [{:lib/type :mbql.stage/mbql
                 :breakout [[:field {} (meta/id :categories :id)]]
                 :aggregation [[:avg {} [:length {} [:field {} (meta/id :categories :name)]]]]
                 :joins
                 [{:lib/type :mbql/join
                   :stages [{:lib/type :mbql.stage/mbql, :source-table (meta/id :venues)}]
                   :conditions [[:= {}
                                 [:field {:join-alias "Venues"} (meta/id :venues :category-id)]
                                 [:field {} (meta/id :categories :id)]]]
                   ;; No :fields :all because it gets removed on joins when there are aggregations/breakouts.
                   :fields (symbol "nil #_\"key is not present.\"")
                   :alias "Venues"}]}]}
              (lib/replace-clause query'
                                  (first aggs)
                                  (lib/avg (lib/length (meta/field-metadata :categories :name)))))))))

(deftest ^:parallel remove-clause-aggregation-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/aggregate (lib/sum (meta/field-metadata :venues :id)))
                  (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
        aggregations (lib/aggregations query)]
    (is (= 2 (count aggregations)))
    (is (= 1 (-> query
                 (lib/remove-clause (first aggregations))
                 (lib/aggregations)
                 count)))
    (is (nil? (-> query
                  (lib/remove-clause (first aggregations))
                  (lib/remove-clause (second aggregations))
                  (lib/aggregations))))
    (testing "removing with dependent should cascade"
      (is (=? {:stages [{:aggregation [(second aggregations)] :order-by (symbol "nil #_\"key is not present.\"")}
                        (complement :filters)]}
              (-> query
                  (as-> <> (lib/order-by <> (lib/aggregation-ref <> 0)))
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "sum"] 1))
                  (lib/remove-clause 0 (first aggregations))))))))

(defn- by-desired-alias
  [columns desired-alias]
  (m/find-first (comp #{desired-alias} :lib/desired-column-alias) columns))

(deftest ^:parallel remove-clause-aggregation-with-ref-test
  (testing "removing an aggregation removes references in order-by (#12625)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/count))
                    (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                    (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                    (as-> $q (lib/order-by $q (lib/aggregation-ref $q 2))))
          aggregations (lib/aggregations query)]
      (is (=? {:stages [(complement :order-by)]}
              (lib/remove-clause query (last aggregations))))
      (let [query (lib/append-stage query)
            sum-col (by-desired-alias (lib/visible-columns query) "sum_2")
            query (lib/order-by query sum-col)]
        (is (=? {:stages [(complement :order-by) (complement :order-by)]}
                (lib/remove-clause query 0 (last aggregations))))))))

(deftest ^:parallel remove-clause-adjust-ref-names-test
  (testing "Field identifiers of same name field refs are adjusted on field removal"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                    (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                    (lib/breakout (meta/field-metadata :orders :user-id))
                    lib/append-stage)
          [a0-column a1-column] (-> query
                                    lib/visible-columns
                                    (->> (filter #(= "sum" (:name %)))))
          query (-> query
                    (lib/expression "xix" (lib/ref a0-column))
                    (lib/expression "yiy" (lib/ref a1-column)))
          a0-ref (first (lib/aggregations query 0))]
      (testing "Base: Second stage field refs are identified as sum and sum_2"
        (is (=? {:stages [{:lib/type :mbql.stage/mbql,
                           :aggregation [[:sum {} [:field {} (meta/id :orders :total)]]
                                         [:sum {} [:field {} (meta/id :orders :subtotal)]]]
                           :breakout [[:field {} (meta/id :orders :user-id)]]}
                          {:lib/type :mbql.stage/mbql,
                           :expressions
                           [[:field
                             {:base-type :type/Float
                              :effective-type :type/Float
                              :lib/expression-name "xix"}
                             "sum"]
                            [:field
                             {:base-type :type/Float
                              :effective-type :type/Float
                              :lib/expression-name "yiy"}
                             "sum_2"]]}]}
                query)))
      (testing "Second stage field ref indetifier is adjusted from sum_2 to sum."
        (is (=? {:stages [{:lib/type :mbql.stage/mbql,
                           :aggregation [[:sum {} [:field {} (meta/id :orders :subtotal)]]]
                           :breakout [[:field {} (meta/id :orders :user-id)]]}
                          {:lib/type :mbql.stage/mbql,
                           :expressions
                           [[:field
                             {:base-type :type/Float
                              :effective-type :type/Float
                              :lib/expression-name "yiy"}
                             "sum"]]}]}
                (lib/remove-clause query 0 a0-ref)))))))

(deftest ^:parallel remove-clause-expression-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/expression "a" (meta/field-metadata :venues :id))
                  (lib/expression "b" (meta/field-metadata :venues :price)))
        [expr-a expr-b :as expressions] (lib/expressions query)]
    (is (= 2 (count expressions)))
    (is (= 1 (-> query
                 (lib/remove-clause expr-a)
                 (lib/expressions)
                 count)))
    (is (nil? (-> query
                  (lib/remove-clause expr-a)
                  (lib/remove-clause expr-b)
                  (lib/expressions))))
    (testing "removing with dependent should cascade"
      (is (=? {:stages [{:expressions [expr-b] :order-by (symbol "nil #_\"key is not present.\"")}
                        (complement :filters)]}
              (-> query
                  (as-> <> (lib/order-by <> (lib/expression-ref <> "a")))
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "a"] 1))
                  (lib/remove-clause 0 expr-a)))))))

(deftest ^:parallel replace-clause-order-by-test
  (binding [lib.schema.expression/*suppress-expression-type-check?* true]
    (let [query (-> (lib.tu/venues-query)
                    (lib/filter (lib/= "myvenue" (meta/field-metadata :venues :name)))
                    (lib/order-by (meta/field-metadata :venues :name))
                    (lib/order-by (meta/field-metadata :venues :price)))
          order-bys (lib/order-bys query)]
      (is (= 2 (count order-bys)))
      (let [replaced (-> query
                         (lib/replace-clause (first order-bys) (lib/order-by-clause (meta/field-metadata :venues :id))))
            replaced-order-bys (lib/order-bys replaced)]
        (is (not= order-bys replaced-order-bys))
        (is (=? [:asc {} [:field {} (meta/id :venues :id)]]
                (first replaced-order-bys)))
        (is (= 2 (count replaced-order-bys)))
        (is (= (second order-bys) (second replaced-order-bys)))))))

(deftest ^:parallel replace-clause-filters-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/filter (lib/= (meta/field-metadata :venues :name) "myvenue"))
                  (lib/filter (lib/= (meta/field-metadata :venues :price) 2)))
        filters (lib/filters query)]
    (is (= 2 (count filters)))
    (let [replaced (-> query
                       (lib/replace-clause (first filters) (lib/= (meta/field-metadata :venues :id) 1)))
          replaced-filters (lib/filters replaced)]
      (is (not= filters replaced-filters))
      (is (=? [:= {} [:field {} (meta/id :venues :id)] 1]
              (first replaced-filters)))
      (is (= 2 (count replaced-filters)))
      (is (= (second filters) (second replaced-filters))))))

(deftest ^:parallel replace-clause-join-conditions-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/join (lib/join-clause (lib/query meta/metadata-provider (meta/table-metadata :categories))
                                             [(lib/= (meta/field-metadata :venues :price) 4)])))
        conditions (lib/join-conditions (first (lib/joins query)))]
    (is (= 1 (count conditions)))
    (let [replaced (-> query
                       (lib/replace-clause (first conditions) (lib/= (meta/field-metadata :venues :id) 1)))
          replaced-conditions (lib/join-conditions (first (lib/joins replaced)))]
      (is (not= conditions replaced-conditions))
      (is (=? [:= {} [:field {} (meta/id :venues :id)] 1]
              (first replaced-conditions)))
      (is (= 1 (count replaced-conditions)))
      (is (= (second conditions) (second replaced-conditions))))))

(deftest ^:parallel replace-clause-join-fields-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/join
                   (-> (lib/join-clause (lib/query meta/metadata-provider (meta/table-metadata :categories))
                                        [(lib/= (meta/field-metadata :venues :price) 4)])
                       (lib/with-join-fields
                         [(meta/field-metadata :categories :id)]))))
        fields (lib/join-fields (first (lib/joins query)))]
    (is (= 1 (count fields)))
    (let [replaced (-> query
                       (lib/replace-clause (first fields) (meta/field-metadata :categories :name)))
          replaced-fields (lib/join-fields (first (lib/joins replaced)))]
      (is (not= fields replaced-fields))
      (is (=? [:field {} (meta/id :categories :name)]
              (first replaced-fields)))
      (is (= 1 (count fields)))
      (is (= 1 (count replaced-fields))))))

(deftest ^:parallel replace-clause-breakout-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/breakout (meta/field-metadata :venues :id))
                  (lib/breakout (meta/field-metadata :venues :name)))
        breakouts (lib/breakouts query)
        replaced (-> query
                     (lib/replace-clause (first breakouts) (meta/field-metadata :venues :price)))
        replaced-breakouts (lib/breakouts replaced)]
    (is (= 2 (count breakouts)))
    (is (=? [:field {} (meta/id :venues :price)]
            (first replaced-breakouts)))
    (is (not= breakouts replaced-breakouts))
    (is (= 2 (count replaced-breakouts)))
    (is (= (second breakouts) (second replaced-breakouts)))
    (testing "replacing with dependent should cascade"
      (is (=? {:stages [{:breakout [[:field {} (meta/id :venues :price)] (second breakouts)]}
                        (complement :filters)]}
              (-> query
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                  (lib/replace-clause 0 (first breakouts) (meta/field-metadata :venues :price)))))
      (is (not= breakouts (-> query
                              (lib/append-stage)
                              (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                              (lib/replace-clause 0 (second breakouts) (meta/field-metadata :venues :price))
                              (lib/breakouts 0)))))))

(deftest ^:parallel replace-clause-breakout-test-2
  (testing "should ignore duplicate breakouts"
    (let [id-column    (meta/field-metadata :venues :id)
          price-column (meta/field-metadata :venues :price)
          query        (-> (lib.tu/venues-query)
                           (lib/breakout id-column)
                           (lib/breakout price-column))
          breakouts    (lib/breakouts query)]
      (is (= query
             (lib/replace-clause query (first breakouts) price-column))))))

(deftest ^:parallel replace-clause-breakout-test-3
  (testing "should ignore duplicate breakouts with the same temporal bucket when converting from legacy MBQL"
    (let [base-query  (lib/query meta/metadata-provider (meta/table-metadata :people))
          column      (meta/field-metadata :people :birth-date)
          query       (-> base-query
                          (lib/breakout (lib/with-temporal-bucket column :year))
                          (lib/breakout (lib/with-temporal-bucket column :month)))
          query       (->> query
                           (lib.query/->legacy-MBQL)
                           (lib/query meta/metadata-provider))]
      (is (= query
             (lib/replace-clause query
                                 (first (lib/breakouts query))
                                 (lib/with-temporal-bucket column :month)))))))

(deftest ^:parallel replace-clause-fields-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/with-fields [(meta/field-metadata :venues :id) (meta/field-metadata :venues :name)]))
        fields (lib/fields query)
        replaced (-> query
                     (lib/replace-clause (first fields) (meta/field-metadata :venues :price)))
        replaced-fields (lib/fields replaced)]
    (is (= 2 (count fields)))
    (is (=? [:field {} (meta/id :venues :price)]
            (first replaced-fields)))
    (is (not= fields replaced-fields))
    (is (= 2 (count replaced-fields)))
    (is (= (second fields) (second replaced-fields)))
    (testing "replacing with dependent should cascade"
      (is (=? {:stages [{:fields [[:field {} (meta/id :venues :price)] (second fields)]}
                        (complement :filters)]}
              (-> query
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                  (lib/replace-clause 0 (first fields) (meta/field-metadata :venues :price)))))
      (is (not= fields (-> query
                           (lib/append-stage)
                           (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                           (lib/replace-clause 0 (second fields) (meta/field-metadata :venues :price))
                           (lib/fields 0)))))))

(deftest ^:parallel replace-clause-aggregation-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/aggregate (lib/sum (meta/field-metadata :venues :id)))
                  (lib/aggregate (lib/distinct (meta/field-metadata :venues :name))))
        aggregations (lib/aggregations query)
        replaced (-> query
                     (lib/replace-clause (first aggregations) (lib/sum (meta/field-metadata :venues :price))))
        replaced-aggregations (lib/aggregations replaced)]
    (is (= 2 (count aggregations)))
    (is (=? [:sum {} [:field {} (meta/id :venues :price)]]
            (first replaced-aggregations)))
    (is (not= aggregations replaced-aggregations))
    (is (= 2 (count replaced-aggregations)))
    (is (= (second aggregations) (second replaced-aggregations)))
    (testing "replacing with dependent should cascade keeping valid parts"
      (let [query' (-> query
                       (as-> <> (lib/aggregate <> (lib/with-expression-name (lib/aggregation-ref <> 0) "expr")))
                       (lib/append-stage)
                       (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "sum"] 1))
                       (lib/replace-clause 0 (first aggregations) (lib/max (meta/field-metadata :venues :price))))
            agg0-id (get-in query' [:stages 0 :aggregation 0 1 :lib/uuid])]
        (is (=? {:stages [{:aggregation [[:max {:lib/uuid string?} [:field {} (meta/id :venues :price)]]
                                         (second aggregations)
                                         [:aggregation {:name "expr", :display-name "expr"} string?]]}
                          {:filters [[:= {} [:field {} "max"] 1]]}]}
                query'))
        (is (string? agg0-id))
        (is (= agg0-id (get-in query' [:stages 0 :aggregation 2 2])))))
    (testing "replacing with dependent should cascade removing invalid parts"
      (binding [lib.schema.expression/*suppress-expression-type-check?* false]
        (is (=? {:stages [{:aggregation [[:sum {} [:field {} (meta/id :products :id)]]
                                         [:max {} [:field {} (meta/id :products :price)]]]}
                          (fn [stage] (not-any? stage [:filters :expressions]))]}
                (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                    (lib/aggregate (lib/sum (meta/field-metadata :products :id)))
                    (lib/aggregate (lib/max (meta/field-metadata :products :created-at)))
                    (lib/append-stage)
                    (as-> <>
                          (lib/expression <> "max month" (lib/get-month (lib/ref (m/find-first (comp #{"max"} :name)
                                                                                               (lib/orderable-columns <>)))))
                      (lib/filter <> (lib/= (lib/ref (m/find-first (comp #{"max month"} :name)
                                                                   (lib/filterable-columns <>)))
                                            1))
                      (lib/replace-clause <> 0
                                          (second (lib/aggregations <> 0))
                                          (lib/max (meta/field-metadata :products :price)))))))))))

(deftest ^:parallel replace-metric-test
  (testing "replacing with metric should work"
    (let [metadata-provider (lib.tu/mock-metadata-provider
                             meta/metadata-provider
                             {:cards [{:id          100
                                       :name        "Sum of Cans"
                                       :database-id (meta/id)
                                       :table-id    (meta/id :venues)
                                       :dataset-query
                                       (-> (lib.tu/venues-query)
                                           (lib/filter (lib/= (meta/field-metadata :venues :price) 4))
                                           (lib/aggregate (lib/sum (meta/field-metadata :venues :price)))
                                           lib.convert/->legacy-MBQL)
                                       :description "Number of toucans plus number of pelicans"
                                       :type :metric}]})
          query (-> (lib/query metadata-provider (lib.metadata/card metadata-provider 100))
                    (lib/aggregate (lib/count)))]
      (is (=? {:stages [{:aggregation [[:metric {:lib/uuid string?} 100]
                                       [:count {:lib/uuid string?}]]}]}
              query))
      (is (=? {:stages [{:aggregation [[:metric {:lib/uuid string?} 100]
                                       [:metric {:lib/uuid string?} 100]]}]}
              (lib/replace-clause
               query
               (second (lib/aggregations query))
               (first (lib/available-metrics query)))))
      (is (=? {:stages [{:aggregation [[:count {:lib/uuid string?}]
                                       [:metric {:lib/uuid string?} 100]]}]}
              (-> query
                  (lib/replace-clause
                   (second (lib/aggregations query))
                   (first (lib/available-metrics query)))
                  (as-> $q (lib/replace-clause $q (first (lib/aggregations $q)) (lib/count)))))))))

(deftest ^:parallel replace-segment-test
  (testing "replacing with segment should work"
    (let [metadata-provider (lib.tu/mock-metadata-provider
                             meta/metadata-provider
                             {:segments  [{:id          100
                                           :name        "Price is 4"
                                           :definition  {:filter
                                                         [:= [:field (meta/id :venues :price) nil] 4]}
                                           :table-id    (meta/id :venues)}
                                          {:id          200
                                           :name        "Price is 5"
                                           :definition  {:filter
                                                         [:= [:field (meta/id :venues :price) nil] 5]}
                                           :table-id    (meta/id :venues)}]})
          query (-> (lib/query metadata-provider (meta/table-metadata :venues))
                    (lib/filter (lib/segment 100)))]
      (is (=? {:stages [{:filters [[:segment {:lib/uuid string?} 200]]}]}
              (lib/replace-clause
               query
               (first (lib/filters query))
               (second (lib/available-segments query))))))))

(deftest ^:parallel replace-clause-expression-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/expression "a" (meta/field-metadata :venues :id))
                  (lib/expression "b" (meta/field-metadata :venues :name)))
        [expr-a expr-b :as expressions] (lib/expressions query)
        replaced (-> query
                     (lib/replace-clause expr-a (meta/field-metadata :venues :price)))
        [_repl-expr-a repl-expr-b :as replaced-expressions] (lib/expressions replaced)]
    (is (= 2 (count expressions)))
    (is (=? [[:field {:lib/expression-name "a"} (meta/id :venues :price)]
             expr-b]
            replaced-expressions))
    (is (not= expressions replaced-expressions))
    (is (= 2 (count replaced-expressions)))
    (is (= expr-b repl-expr-b))
    (testing "replacing with dependent should cascade"
      (is (=? {:stages [{:aggregation (symbol "nil #_\"key is not present.\"")
                         :expressions [[:field {:lib/expression-name "a"} (meta/id :venues :price)]
                                       expr-b]}
                        (complement :filters)]}
              (-> query
                  (as-> <> (lib/aggregate <> (lib/sum (lib/expression-ref <> "a"))))
                  (as-> <> (lib/with-fields <> [(lib/expression-ref <> "a")]))
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "a"] 1))
                  (lib/replace-clause 0 expr-a (meta/field-metadata :venues :price))))))
    (testing "replace with literal expression"
      (is (=? {:stages [{:expressions [[:value {:lib/expression-name "a" :effective-type :type/Integer} 999]
                                       expr-b]}]}
              (-> query
                  (lib/replace-clause 0 expr-a 999)))))))

(deftest ^:parallel replace-clause-expression-used-in-breakout-test
  (let [query    (-> (lib.tu/venues-query)
                     (lib/expression "a" (lib/+ (meta/field-metadata :venues :name) 7))
                     (as-> $q (lib/breakout $q -1 (lib/expression-ref $q -1 "a"))))
        [expr]   (lib/expressions query)
        edited   (lib/replace-clause query -1 expr (lib/with-expression-name expr "b"))]
    (is (=? [{:lib/expression-name "b"}]
            (map lib.options/options (lib/expressions edited))))
    (is (=? [[:expression {} "b"]]
            (lib/breakouts edited)))))

(deftest ^:parallel replace-order-by-breakout-col-test
  (testing "issue #30980"
    (testing "Bucketing should keep order-by in sync"
      (let [query (lib/query meta/metadata-provider (meta/table-metadata :users))
            breakout-col (->> (lib/breakoutable-columns query)
                              (m/find-first (comp #{"LAST_LOGIN"} :name)))
            month (->> (lib/available-temporal-buckets query breakout-col)
                       (m/find-first (comp #{:month} :unit))
                       (lib/with-temporal-bucket breakout-col))
            day (->> (lib/available-temporal-buckets query breakout-col)
                     (m/find-first (comp #{:day} :unit))
                     (lib/with-temporal-bucket breakout-col))
            q2 (-> query
                   (lib/breakout month))
            cols (lib/orderable-columns q2)
            q3 (-> q2
                   (lib/order-by (first cols))
                   (lib/replace-clause (first (lib/breakouts q2)) day))
            q4 (lib/replace-clause q3 (first (lib/breakouts q3)) month)]
        (is (= :day (:temporal-unit (second (last (first (lib/order-bys q3)))))))
        (is (= :month (:temporal-unit (second (last (first (lib/order-bys q4)))))))))
    (testing "Binning should keep in order-by in sync"
      (let [query (lib.tu/venues-query)
            breakout-col (->> (lib/breakoutable-columns query)
                              (m/find-first (comp #{"PRICE"} :name)))
            ten (->> (lib/available-binning-strategies query breakout-col)
                     (m/find-first (comp #{"10 bins"} :display-name))
                     (lib/with-binning breakout-col))
            hundo (->> (lib/available-binning-strategies query breakout-col)
                       (m/find-first (comp #{"100 bins"} :display-name))
                       (lib/with-binning breakout-col))
            q2 (-> query
                   (lib/breakout ten))
            cols (lib/orderable-columns q2)
            q3 (-> q2
                   (lib/order-by (first cols))
                   (lib/replace-clause (first (lib/breakouts q2)) hundo))
            q4 (lib/replace-clause q3 (first (lib/breakouts q3)) ten)]
        (is (= 100 (:num-bins (:binning (second (last (first (lib/order-bys q3))))))))
        (is (= 10 (:num-bins (:binning (second (last (first (lib/order-bys q4))))))))))
    (testing "Replace the correct order-by bin when there are multiple"
      (let [query (lib.tu/venues-query)
            breakout-col (->> (lib/breakoutable-columns query)
                              (m/find-first (comp #{"PRICE"} :name)))
            ten (->> (lib/available-binning-strategies query breakout-col)
                     (m/find-first (comp #{"10 bins"} :display-name))
                     (lib/with-binning breakout-col))
            fiddy (->> (lib/available-binning-strategies query breakout-col)
                       (m/find-first (comp #{"50 bins"} :display-name))
                       (lib/with-binning breakout-col))
            hundo (->> (lib/available-binning-strategies query breakout-col)
                       (m/find-first (comp #{"100 bins"} :display-name))
                       (lib/with-binning breakout-col))
            auto (->> (lib/available-binning-strategies query breakout-col)
                      (m/find-first (comp #{"Auto bin"} :display-name))
                      (lib/with-binning breakout-col))
            q2 (-> query
                   (lib/breakout auto)
                   (lib/breakout ten)
                   (lib/breakout hundo))
            cols (lib/orderable-columns q2)
            q3 (-> q2
                   (lib/order-by (first cols))
                   (lib/order-by (second cols))
                   (lib/order-by (last cols)))
            ten-breakout (second (lib/breakouts q3))]
        (is (= ["Price: Auto binned" "Price: 10 bins" "Price: 100 bins"]
               (map (comp :display-name #(lib/display-info q2 %)) cols)))
        (is (= 10 (-> ten-breakout second :binning :num-bins)))
        (is (=? [{:strategy :default} {:num-bins 10} {:num-bins 100}]
                (map (comp :binning second last)
                     (lib/order-bys q3))))
        (is (=? [{:strategy :default} {:num-bins 50} {:num-bins 100}]
                (map (comp :binning second last)
                     (-> q3
                         (lib/replace-clause ten-breakout fiddy)
                         lib/order-bys))))))
    (testing "Replacing with a new field should remove the order by"
      (let [query (lib.tu/venues-query)
            breakout-col (->> (lib/breakoutable-columns query)
                              (m/find-first (comp #{"PRICE"} :name)))
            new-breakout-col (->> (lib/breakoutable-columns query)
                                  (m/find-first (comp #{"NAME"} :name)))
            ten (->> (lib/available-binning-strategies query breakout-col)
                     (m/find-first (comp #{"10 bins"} :display-name))
                     (lib/with-binning breakout-col))
            q2 (-> query
                   (lib/breakout ten))
            cols (lib/orderable-columns q2)
            q3 (-> q2
                   (lib/order-by (first cols)))
            ten-breakout (first (lib/breakouts q3))]
        (is (nil?
             (-> q3
                 (lib/replace-clause ten-breakout new-breakout-col)
                 lib/order-bys)))))
    (testing "Removing a breakout should remove the order by"
      (let [query (lib.tu/venues-query)
            breakout-col (->> (lib/breakoutable-columns query)
                              (m/find-first (comp #{"PRICE"} :name)))
            q2 (-> query
                   (lib/breakout breakout-col))
            cols (lib/orderable-columns q2)
            q3 (-> q2
                   (lib/order-by (first cols)))
            ten-breakout (first (lib/breakouts q3))]
        (is (nil?
             (-> q3
                 (lib/remove-clause ten-breakout)
                 lib/order-bys)))))))

(deftest ^:parallel replace-breakout-syncs-extra-fields-to-order-by
  (testing "issue #52124"
    (testing "Changing a breakout should sync all fields to the order-by"
      (let [query (lib/query meta/metadata-provider (meta/table-metadata :users))
            breakout-col (->> (lib/breakoutable-columns query)
                              (m/find-first (comp #{"LAST_LOGIN"} :name)))
            month (lib/with-temporal-bucket breakout-col :month)
            day (assoc (lib/with-temporal-bucket breakout-col :day)
                       :metabase.lib.field/original-temporal-unit :month)
            q2 (-> query
                   (lib/breakout month))
            cols (lib/orderable-columns q2)
            q3 (-> q2
                   (lib/order-by (first cols))
                   (lib/replace-clause (first (lib/breakouts q2)) day))]
        (is (= (get-in q3 [:stages 0 :breakout 0 1 :metabase.lib.field/original-temporal-unit])
               (get-in q3 [:stages 0 :order-by 0 2 1 :metabase.lib.field/original-temporal-unit])))))))

(deftest ^:parallel rename-join-test
  (let [joined-column (-> (meta/field-metadata :venues :id)
                          (lib/with-join-alias "alias"))
        join-clause (-> (lib/join-clause
                         (meta/table-metadata :venues)
                         [(lib/= (meta/field-metadata :checkins :venue-id)
                                 joined-column)])
                        (lib/with-join-alias "alias"))]
    (testing "Missing join"
      (let [query (lib/query meta/metadata-provider (meta/table-metadata :checkins))]
        (testing "by name"
          (is (= query
                 (lib/rename-join query "old-name" "new-name"))))
        (testing "by index"
          (are [idx]
               (= query
                  (lib/rename-join query idx "new-name"))
            -1 0 1))
        (testing "by join clause"
          (is (= query
                 (lib/rename-join query join-clause "new-name"))))))
    (let [query      (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                         (lib/join join-clause)
                         (lib/filter (lib/> joined-column 3)))]
      (testing "Simple renaming"
        (let [renamed {:lib/type :mbql/query
                       :database (meta/id)
                       :stages [{:lib/type :mbql.stage/mbql,
                                 :source-table (meta/id :checkins)
                                 :joins [{:lib/type :mbql/join
                                          :stages [{:lib/type :mbql.stage/mbql
                                                    :source-table (meta/id :venues)}]
                                          :conditions [[:=
                                                        {}
                                                        [:field
                                                         {:base-type :type/Integer
                                                          :effective-type :type/Integer}
                                                         (meta/id :checkins :venue-id)]
                                                        [:field
                                                         {:base-type :type/BigInteger
                                                          :effective-type :type/BigInteger
                                                          :join-alias "locale"}
                                                         (meta/id :venues :id)]]],
                                          :alias "locale"}]
                                 :filters [[:>
                                            {}
                                            [:field
                                             {:base-type :type/BigInteger
                                              :effective-type :type/BigInteger
                                              :join-alias "locale"}
                                             (meta/id :venues :id)]
                                            3]]}]}]
          (testing "by name"
            (is (=? renamed
                    (lib/rename-join query "alias" "locale"))))
          (testing "by index"
            (is (=? renamed
                    (lib/rename-join query 0 "locale"))))
          (testing "by join clause"
            (is (=? renamed
                    (lib/rename-join query (first (lib/joins query)) "locale"))))))
      (testing "Clashing renaming"
        (let [query' (-> query
                         (lib/join (-> (lib/join-clause
                                        (meta/table-metadata :users)
                                        [(lib/= (meta/field-metadata :checkins :user-id)
                                                (-> (meta/field-metadata :users :id)
                                                    (lib/with-join-alias "Users")))])
                                       (lib/with-join-alias "Users"))))
              renamed {:lib/type :mbql/query
                       :database (meta/id)
                       :stages [{:lib/type :mbql.stage/mbql,
                                 :source-table (meta/id :checkins)
                                 :joins [{:lib/type :mbql/join
                                          :stages [{:lib/type :mbql.stage/mbql
                                                    :source-table (meta/id :venues)}]
                                          :conditions [[:=
                                                        {}
                                                        [:field
                                                         {:base-type :type/Integer
                                                          :effective-type :type/Integer}
                                                         (meta/id :checkins :venue-id)]
                                                        [:field
                                                         {:base-type :type/BigInteger
                                                          :effective-type :type/BigInteger
                                                          :join-alias "alias"}
                                                         (meta/id :venues :id)]]],
                                          :alias "alias"}
                                         {:lib/type :mbql/join
                                          :stages [{:lib/type :mbql.stage/mbql
                                                    :source-table (meta/id :users)}]
                                          :conditions [[:=
                                                        {}
                                                        [:field
                                                         {:base-type :type/Integer
                                                          :effective-type :type/Integer}
                                                         (meta/id :checkins :user-id)]
                                                        [:field
                                                         {:base-type :type/BigInteger
                                                          :effective-type :type/BigInteger
                                                          :join-alias "alias_2"}
                                                         (meta/id :users :id)]]],
                                          :alias "alias_2"}]
                                 :filters [[:>
                                            {}
                                            [:field
                                             {:base-type :type/BigInteger
                                              :effective-type :type/BigInteger
                                              :join-alias "alias"}
                                             (meta/id :venues :id)]
                                            3]]}]}]
          (testing "by name"
            (is (=? renamed
                    (lib/rename-join query' "Users" "alias"))))
          (testing "by index"
            (is (=? renamed
                    (lib/rename-join query' 1 "alias"))))
          (testing "by join clause"
            (is (=? renamed
                    (lib/rename-join query' (second (lib/joins query')) "alias")))))))))

(deftest ^:parallel remove-join-test
  (testing "Missing join"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :checkins))]
      (testing "by index"
        (are [idx] (= query
                      (lib/remove-join query 0 idx))
          -1 0 1))
      (testing "by name"
        (is (= query
               (lib/remove-join query 0 "old-alias"))))))
  (let [join-alias "alias"
        joined-column (-> (meta/field-metadata :venues :id)
                          (lib/with-join-alias join-alias))
        query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                  (lib/join (-> (lib/join-clause
                                 (meta/table-metadata :venues)
                                 [(lib/= (meta/field-metadata :checkins :venue-id)
                                         (-> (meta/field-metadata :venues :id)
                                             (lib/with-join-alias join-alias)))])
                                (lib/with-join-fields :all)
                                (lib/with-join-alias join-alias)))
                  (lib/filter (lib/> joined-column 3)))]
    (testing "Removing the last join"
      (let [result {:lib/type :mbql/query
                    :database (meta/id)
                    :stages   [{:lib/type     :mbql.stage/mbql,
                                :source-table (meta/id :checkins)}]
                    :joins    (symbol "nil #_\"key is not present.\"")
                    :filters  (symbol "nil #_\"key is not present.\"")}]
        (testing "by index"
          (is (=? result
                  (lib/remove-join query 0 0))))
        (testing "by name"
          (is (=? result
                  (lib/remove-join query 0 join-alias))))
        (testing "by join-clause"
          (is (=? result
                  (lib/remove-join query 0 (first (lib/joins query))))))))
    (testing "Removing one of the joins"
      (let [filter-field [:field {:base-type :type/DateTime} "Users__LAST_LOGIN"]
            query' (-> query
                       (lib/join (-> (lib/join-clause
                                      (meta/table-metadata :users)
                                      [(lib/= (meta/field-metadata :checkins :user-id)
                                              (-> (meta/field-metadata :users :id)
                                                  (lib/with-join-alias "Users")))])
                                     (lib/with-join-fields :all)
                                     (lib/with-join-alias "Users")))
                       lib/append-stage
                       (lib/filter (lib/not-null (lib.options/ensure-uuid filter-field)))
                       (lib/breakout (lib.options/ensure-uuid filter-field)))
            result {:lib/type :mbql/query
                    :database (meta/id)
                    :stages [{:lib/type :mbql.stage/mbql,
                              :source-table (meta/id :checkins)
                              :joins [{:lib/type :mbql/join
                                       :stages [{:lib/type :mbql.stage/mbql
                                                 :source-table (meta/id :venues)}]
                                       :fields :all
                                       :conditions [[:=
                                                     {}
                                                     [:field
                                                      {:base-type :type/Integer
                                                       :effective-type :type/Integer}
                                                      (meta/id :checkins :venue-id)]
                                                     [:field
                                                      {:base-type :type/BigInteger
                                                       :effective-type :type/BigInteger
                                                       :join-alias join-alias}
                                                      (meta/id :venues :id)]]],
                                       :alias join-alias}]
                              :filters [[:>
                                         {}
                                         [:field
                                          {:base-type :type/BigInteger,
                                           :effective-type :type/BigInteger,
                                           :join-alias join-alias}
                                          (meta/id :venues :id)]
                                         3]]}
                             {:filters  (symbol "nil #_\"key is not present.\"")
                              :breakout (symbol "nil #_\"key is not present.\"")}]}]
        (testing "by index"
          (is (=? result
                  (lib/remove-join query' 0 1))))
        (testing "by name"
          (is (=? result
                  (lib/remove-join query' 0 "Users"))))
        (testing "by join-clause"
          (is (=? result
                  (lib/remove-join query' 0 (second (lib/joins query' 0)))))
          (testing "using remove-clause"
            (is (=? result
                    (lib/remove-clause query' 0 (second (lib/joins query' 0)))))))))))

(deftest ^:parallel remove-dependent-join-test
  (let [first-join-clause (-> (lib/join-clause
                               (meta/table-metadata :checkins)
                               [(lib/= (meta/field-metadata :venues :id)
                                       (-> (meta/field-metadata :checkins :venue-id)
                                           (lib/with-join-alias "Checkins")))])
                              (lib/with-join-fields :all)
                              (lib/with-join-alias "Checkins"))
        query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/join first-join-clause)
                  (lib/join (-> (lib/join-clause
                                 (meta/table-metadata :users)
                                 [(lib/= (-> (meta/field-metadata :checkins :user-id)
                                             (lib/with-join-alias "Checkins"))
                                         (-> (meta/field-metadata :users :id)
                                             (lib/with-join-alias "Users")))])
                                (lib/with-join-fields :all)
                                (lib/with-join-alias "Users"))))]
    (is (nil? (lib/joins (lib/remove-clause query 0 first-join-clause))))))

(deftest ^:parallel remove-dependent-join-from-subsequent-stage-test
  (testing "Join from previous stage used in join can be removed (#34404)"
    (let [join-query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                         (lib/join (-> (lib/join-clause
                                        (meta/table-metadata :checkins)
                                        [(lib/= (meta/field-metadata :venues :id)
                                                (-> (meta/field-metadata :checkins :venue-id)
                                                    (lib/with-join-alias "Checkins")))])
                                       (lib/with-join-fields :all)
                                       (lib/with-join-alias "Checkins"))))
          breakout-col (m/find-first (comp #{(meta/id :checkins :venue-id)} :id)
                                     (lib/breakoutable-columns join-query))
          breakout-query (-> join-query
                             (lib/breakout breakout-col)
                             (lib/aggregate (lib/count))
                             (lib/append-stage))
          query (-> breakout-query
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :checkins)
                                   [(lib/= (first (lib/returned-columns breakout-query))
                                           (-> (meta/field-metadata :checkins :venue-id)
                                               (lib/with-join-alias "Checkins2")))])
                                  (lib/with-join-fields :all)
                                  (lib/with-join-alias "Checkins2"))))]
      (is (nil? (lib/joins (lib/remove-clause query 0 (first (lib/joins query 0)))))))))

(deftest ^:parallel replace-join-test
  (let [query             (lib.tu/query-with-join)
        expected-original {:stages [{:joins [{:lib/type :mbql/join, :alias "Cat", :fields :all}]}]}
        [original-join]   (lib/joins query)
        new-join          (lib/with-join-fields original-join :none)]
    (is (=? expected-original
            query))
    (testing "dangling join-spec leads to no change"
      (are [join-spec] (=? expected-original
                           (lib/replace-join query 0 join-spec new-join))
        -1 1 "missing-alias"))
    (testing "replace using index"
      (is (=? {:stages [{:joins [{:lib/type :mbql/join, :alias "Cat", :fields :none}]}]}
              (lib/replace-join query 0 new-join))))
    (testing "replace using alias"
      (is (=? {:stages [{:joins [{:lib/type :mbql/join, :alias "Cat", :fields :none}]}]}
              (lib/replace-join query "Cat" new-join))))
    (testing "replace using replace-clause"
      (is (=? {:stages [{:joins [{:lib/type :mbql/join, :alias "Cat", :fields :none}]}]}
              (lib/replace-clause query original-join new-join))))
    (let [join-alias "alias"
          price-name (str join-alias "__PRICE")
          joined-column (-> (meta/field-metadata :venues :id)
                            (lib/with-join-alias join-alias))
          users-alias "Users"
          last-login-name (str users-alias "__LAST_LOGIN")
          breakout-field [:field {:base-type :type/DateTime} last-login-name]
          query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :venues)
                                   [(lib/= (meta/field-metadata :checkins :venue-id)
                                           (-> (meta/field-metadata :venues :id)
                                               (lib/with-join-alias join-alias)))])
                                  (lib/with-join-fields :all)
                                  (lib/with-join-alias join-alias)))
                    (lib/filter (lib/> joined-column 3))
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :users)
                                   [(lib/= (meta/field-metadata :checkins :user-id)
                                           (-> (meta/field-metadata :users :id)
                                               (lib/with-join-alias users-alias)))])
                                  (lib/with-join-fields :all)
                                  (lib/with-join-alias users-alias)))
                    lib/append-stage
                    (lib/filter (lib/< (lib.options/ensure-uuid [:field {:base-type :type/Integer} price-name]) 3))
                    (lib/filter (lib/not-null (lib.options/ensure-uuid breakout-field)))
                    (lib/breakout (lib.options/ensure-uuid breakout-field)))
          [join0 join1] (lib/joins query 0)]
      (testing "effects are reflected in subsequent stages"
        (is (=? {:stages [{:joins [{:fields :none, :alias join-alias}
                                   {:fields :all, :alias users-alias}]
                           :filters [[:> {} [:field {:join-alias join-alias} (meta/id :venues :id)] 3]]}
                          {:filters [[:not-null {} [:field {} last-login-name]]]
                           :breakout [[:field {} last-login-name]]}]}
                (lib/replace-clause query 0 join0 (lib/with-join-fields join0 :none)))))
      (testing "replacing with nil removes the join"
        (is (=? {:stages
                 [{:joins [{:fields :all, :alias join-alias}]
                   :filters [[:> {} [:field {:join-alias join-alias} (meta/id :venues :id)] 3]]}
                  {:filters [[:< {} [:field {} price-name] 3]]}]}
                (lib/replace-clause query 0 join1 nil)))))))

(deftest ^:parallel replace-join-with-new-join-test
  (let [filter-1   #(lib/= (meta/field-metadata :orders :product-id)
                           (meta/field-metadata :products :id))
        filter-2   #(lib/=
                     (meta/field-metadata :orders :created-at)
                     (meta/field-metadata :products :created-at))
        query      (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                       (lib/join (lib/join-clause (meta/table-metadata :products) [(filter-1)])))
        new-clause (lib/join-clause (meta/table-metadata :products) [(filter-2)])]
    (testing "New clause alias is maintained if table is maintained"
      (let [multi-query     (-> query
                                (lib/join (lib/join-clause (meta/table-metadata :products) [(filter-2)]))
                                (lib/join (lib/join-clause (meta/table-metadata :products) [(filter-2)])))
            original-joins (lib/joins multi-query)
            replaced-joins (-> multi-query
                               (lib/replace-clause -1 (second (lib/joins multi-query)) new-clause)
                               lib/joins)]
        (is (= ["Products" "Products - Created At" "Products - Created At_2"]
               (map :alias original-joins)
               (map :alias replaced-joins)))))
    (testing "New clause alias reflects new table"
      (let [multi-query (-> query
                            (lib/join (lib/join-clause (meta/table-metadata :products) [(filter-2)]))
                            (lib/join (lib/join-clause (meta/table-metadata :products) [(filter-2)])))]
        (is (= ["Products" "Users" "Products - Created At_2"]
               (->> (lib/replace-clause multi-query -1 (second (lib/joins multi-query))
                                        (lib/join-clause (meta/table-metadata :users)
                                                         [(lib/= (meta/field-metadata :orders :user-id)
                                                                 (meta/field-metadata :users :id))]))
                    :stages
                    first
                    :joins
                    (map :alias))))))))

(deftest ^:parallel replace-join-on-models-test
  (testing "ambiguous model fields shouldn't get a join alias added incorrectly"
    (let [base-query {:lib/type :mbql/query
                      :lib/metadata (lib.tu/metadata-provider-with-mock-cards)
                      :database (meta/id)
                      :stages [{:lib/type :mbql.stage/mbql
                                :source-card (:id (:orders (lib.tu/mock-cards)))}]}
          product-card (:products (lib.tu/mock-cards))
          [orders-id orders-product-id] (lib/join-condition-lhs-columns base-query product-card nil nil)
          [products-id] (lib/join-condition-rhs-columns base-query product-card (lib/ref orders-product-id) nil)
          query (lib/join base-query (lib/join-clause product-card [(lib/= orders-product-id products-id)]))
          [join] (lib/joins query)
          new-clause (lib.join/with-join-alias
                      (lib/join-clause product-card [(lib/= orders-id products-id)])
                      "fake join alias")
          new-query (lib/replace-clause query join new-clause)
          [new-join] (lib/joins new-query)]
      (is (=? {:stages
               [{:joins
                 [{:conditions
                   [[:=
                     {}
                     [:field #(not (contains? % :join-alias)) "ID"]
                     [:field {:join-alias (:alias new-join)} any?]]]
                   :alias (:alias new-join)}]}]}
              new-query)))))

(deftest ^:parallel remove-first-in-long-series-of-join-test
  (testing "Recursive join removal (#35049)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :reviews))
                    (lib/join (meta/table-metadata :products))
                    (lib/join (lib/join-clause (meta/table-metadata :orders) [(lib/= (lib/with-join-alias (meta/field-metadata :products :id) "Products")
                                                                                     (lib/with-join-alias (meta/field-metadata :orders :product-id) "Orders"))]))
                    (lib/join (meta/table-metadata :people)))]
      (is (=?
           {:stages [(complement :joins)]}
           (lib/remove-clause query -1 (first (lib/joins query))))))))

(deftest ^:parallel removing-aggregation-leaves-breakouts
  (testing "Removing aggregation leaves breakouts (#28609)"
    (let [query (-> (lib.tu/venues-query)
                    (lib/aggregate (lib/count)))
          query (reduce lib/breakout
                        query
                        (lib/breakoutable-columns query))
          result (lib/remove-clause query (first (lib/aggregations query)))]
      (is (seq (lib/breakouts result)))
      (is (empty? (lib/aggregations result)))
      (is (= (lib/breakouts query) (lib/breakouts result))))))

(deftest ^:parallel removing-last-aggregation-brings-back-all-fields-on-joins
  (testing "Removing the last aggregation puts :fields :all on join clauses"
    (let [base   (-> (lib.tu/venues-query)
                     (lib/join (lib/join-clause (meta/table-metadata :products)
                                                [(lib/= (meta/field-metadata :orders :product-id)
                                                        (meta/field-metadata :products :id))])))
          query  (lib/aggregate base (lib/count))
          result (lib/remove-clause query (first (lib/aggregations query)))]
      (is (= :all (-> base :stages first :joins first :fields)))
      (is (= :all (-> result :stages first :joins first :fields)))
      (is (=? (map :name (lib/returned-columns base))
              (map :name (lib/returned-columns result)))))))

(deftest ^:parallel removing-last-breakout-brings-back-all-fields-on-joins
  (testing "Removing the last breakout puts :fields :all on join clauses"
    (let [base   (-> (lib.tu/venues-query)
                     (lib/join (lib/join-clause (meta/table-metadata :products)
                                                [(lib/= (meta/field-metadata :orders :product-id)
                                                        (meta/field-metadata :products :id))])))
          query  (-> base
                     (lib/aggregate (lib/count))
                     (lib/breakout (meta/field-metadata :products :category)))
          agg    (first (lib/aggregations query))
          brk    (first (lib/breakouts query))]
      (is (= :all (-> base :stages first :joins first :fields)))

      (testing "no change to join"
        (testing "when removing just the aggregation"
          (is (= (m/dissoc-in query [:stages 0 :aggregation])
                 (lib/remove-clause query agg))))
        (testing "when removing just the breakout"
          (is (= (m/dissoc-in query [:stages 0 :breakout])
                 (lib/remove-clause query brk)))))
      (testing "join gets :fields :all"
        (testing "removing aggregation and then breakout"
          (is (= :all
                 (-> query
                     (lib/remove-clause agg)
                     (lib/remove-clause brk)
                     :stages first :joins first :fields))))
        (testing "removing breakout and then aggregation"
          (is (= :all
                 (-> query
                     (lib/remove-clause brk)
                     (lib/remove-clause agg)
                     :stages first :joins first :fields))))))))

(deftest ^:parallel simple-tweak-expression-test
  (let [table     (lib/query meta/metadata-provider (meta/table-metadata :orders))
        base      (lib/expression table "Tax Rate" (lib// (meta/field-metadata :orders :tax)
                                                          (meta/field-metadata :orders :total)))
        query     (lib/filter base (lib/> (lib/expression-ref base "Tax Rate") 6))
        orig-expr (first (lib/expressions query))
        new-expr  (-> (lib/* (lib// (meta/field-metadata :orders :tax)
                                    (meta/field-metadata :orders :total))
                             100)
                      (lib/with-expression-name "Tax Rate"))]
    (is (=? {:lib/type :mbql/query,
             :stages
             [{:lib/type :mbql.stage/mbql
               :source-table (meta/id :orders)
               :expressions
               [[:* {:lib/expression-name "Tax Rate"}
                 [:/ {}
                  [:field {:effective-type :type/Float} (meta/id :orders :tax)]
                  [:field {:effective-type :type/Float} (meta/id :orders :total)]]
                 100]]
               :filters [[:> {} [:expression {:effective-type :type/Float} "Tax Rate"] 6]]}]}
            (lib/replace-clause query orig-expr new-expr)))))

(deftest ^:parallel simple-tweak-aggregation-test
  (let [base        (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                        (lib/aggregate (lib/with-expression-name
                                         (lib// (lib/sum (meta/field-metadata :orders :tax))
                                                (lib/count (meta/field-metadata :orders :tax)))
                                         "Avg Tax"))
                        (lib/breakout (meta/field-metadata :orders :user-id))
                        lib/append-stage)
        avg-tax-col (second (lib/returned-columns base))
        query       (lib/filter base (lib/> avg-tax-col 0.06))
        orig-agg    (first (lib/aggregations query 0))
        new-agg     (-> (lib/avg (meta/field-metadata :orders :tax))
                        (lib/with-expression-name "Avg Tax"))]
    (is (=? {:stages
             [{:lib/type :mbql.stage/mbql
               :source-table (meta/id :orders)
               :aggregation [[:avg {:name         "Avg Tax"
                                    :display-name "Avg Tax"}
                              [:field {:effective-type :type/Float} (meta/id :orders :tax)]]]
               :breakout [[:field {:effective-type :type/Integer} (meta/id :orders :user-id)]]}
              {:lib/type :mbql.stage/mbql,
               :filters [[:> {} [:field {:effective-type :type/Float} "Avg Tax"] 0.06]]}]}
            (lib/replace-clause query 0 orig-agg new-agg)))))

(deftest ^:parallel replace-clause-uses-custom-expression-name-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/expression "expr" (lib/+ 1 1)))
        expr  (first (lib/expressions query))]
    (is (=? [[:+ {:lib/expression-name "expr"} 1 1]]
            (lib/expressions query)))
    (is (=? [[:value {:lib/expression-name "evaluated expr"
                      :name (symbol "nil #_\"key is not present.\"")
                      :display-name (symbol "nil #_\"key is not present.\"")
                      :effective-type :type/Integer}
              2]]
            (-> query
                (lib/replace-clause expr (lib/with-expression-name 2 "evaluated expr"))
                lib/expressions)))))

(deftest ^:parallel normalize-fields-clauses-test
  (testing "queries with no :fields clauses should not be changed"
    (are [query-fn] (let [q (query-fn)] (= q (lib.remove-replace/normalize-fields-clauses q)))
      lib.tu/query-with-join
      lib.tu/query-with-self-join
      lib.tu/venues-query))
  (testing "a :fields clause with extras is retained"
    (let [base     (lib/query meta/metadata-provider (meta/table-metadata :orders))
          viz      (lib/visible-columns base)
          category (m/find-first #(= (:name %) "CATEGORY") viz)
          query    (lib/add-field base 0 category)]
      (is (= base  (lib.remove-replace/normalize-fields-clauses base)))
      (is (= query (lib.remove-replace/normalize-fields-clauses query)))))
  (testing "a :fields clause with a default field removed is retained"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/remove-field 0 (assoc (meta/field-metadata :orders :tax)
                                               :lib/source :source/table-defaults)))]
      (is (= 8 (-> query :stages first :fields count)))
      (is (= query (lib.remove-replace/normalize-fields-clauses query)))))
  (testing "if :fields clause matches the defaults it is dropped"
    (testing "removing then restoring a field"
      (let [tax     (assoc (meta/field-metadata :orders :tax)
                           :lib/source :source/table-defaults)
            tax-ref (lib/ref tax)
            query   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                        (lib/remove-field 0 tax)
                        ;; Can't use lib/add-field here because it will normalize the :fields clause.
                        (update-in [:stages 0 :fields] conj tax-ref))]
        (is (= 9 (-> query :stages first :fields count)))
        (is (nil? (-> query
                      lib.remove-replace/normalize-fields-clauses
                      :stages
                      first
                      :fields)))))
    (testing "adding and dropping and implicit join field"
      (let [category (assoc (meta/field-metadata :products :category)
                            :lib/source :source/implicitly-joinable)
            query    (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         (lib/add-field 0 category)
                         ;; Can't use remove-field itself; it will normalize the fields clause.
                         (update-in [:stages 0 :fields] #(remove (comp #{(meta/id :products :category)} last) %)))]
        (is (= 9 (-> query :stages first :fields count)))
        (is (nil? (-> query
                      lib.remove-replace/normalize-fields-clauses
                      :stages
                      first
                      :fields))))))
  (testing ":fields clauses on joins"
    (testing "are preserved if :none or :all"
      (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                      (lib/join (lib/join-clause (meta/table-metadata :products)
                                                 [(lib/= (meta/field-metadata :orders :product-id)
                                                         (meta/field-metadata :products :id))])))
            none  (assoc-in query [:stages 0 :joins 0 :fields] :none)]
        (is (= :all (-> query :stages first :joins first :fields)))
        (is (= query (lib.remove-replace/normalize-fields-clauses query)))
        (is (= none  (lib.remove-replace/normalize-fields-clauses none)))))
    (testing "are preserved if they do not match the defaults"
      (let [join   (-> (lib/join-clause (meta/table-metadata :products)
                                        [(lib/= (meta/field-metadata :orders :product-id)
                                                (meta/field-metadata :products :id))])
                       (lib/with-join-fields (for [field (take 4 (meta/fields :products))]
                                               (meta/field-metadata :products field))))
            query  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                       (lib/join join))]
        (is (= 4 (-> query :stages first :joins first :fields count)))
        (is (= query (lib.remove-replace/normalize-fields-clauses query)))))
    (testing "are replaced with :all if they include all the defaults"
      (let [join   (-> (lib/join-clause (meta/table-metadata :products)
                                        [(lib/= (meta/field-metadata :orders :product-id)
                                                (meta/field-metadata :products :id))])
                       (lib/with-join-fields (for [field (meta/fields :products)]
                                               (meta/field-metadata :products field))))
            query  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                       (lib/join join))]
        (is (= 8 (-> query :stages first :joins first :fields count)))
        (is (= (assoc-in query [:stages 0 :joins 0 :fields] :all)
               (lib.remove-replace/normalize-fields-clauses query)))))))

(defn- by-name
  [columns col-name]
  (m/find-first #(= (:name %) col-name) columns))

(def ^:private multi-stage-query-with-expressions
  (-> (lib.tu/venues-query)
      (lib/expression "double price" (lib/* (meta/field-metadata :venues :price) 2))
      (lib/expression "name length" (lib/length (meta/field-metadata :venues :name)))
      (as-> q
            (lib/filter q (lib/< (lib/expression-ref q "double price") 5))
        (lib/filter q (lib/> (lib/expression-ref q "name length") 9))
        (lib/breakout q (lib/expression-ref q "name length"))
        (lib/aggregate q (lib/sum (lib/expression-ref q "double price"))))
      lib/append-stage
      (as-> q
            (lib/filter q (lib/> (by-name (lib/filterable-columns q) "sum") 20))
        (lib/order-by q (by-name (lib/orderable-columns q) "sum") :desc)
        (lib/order-by q (by-name (lib/orderable-columns q) "name length")))
      lib/append-stage
      (as-> q
            (lib/breakout q (by-name (lib/breakoutable-columns q) "name length")))
      lib/append-stage
      lib/append-stage
      (as-> q
            (lib/filter q (lib/< (by-name (lib/filterable-columns q) "name length") 23)))))

(deftest ^:parallel rename-expression-test
  (let [q         multi-stage-query-with-expressions
        replaced  (lib/replace-clause q 0
                                      (first (lib/expressions q 0))
                                      (lib/with-expression-name
                                        (lib/+ (meta/field-metadata :venues :price) 2)
                                        "increased price"))]
    (is (=? {:stages [{:source-table (meta/id :venues)
                       :expressions [[:+ {:lib/expression-name "increased price"}
                                      [:field {:base-type :type/Integer} (meta/id :venues :price)] 2]
                                     [:length {:lib/expression-name "name length"}
                                      [:field {:base-type :type/Text} (meta/id :venues :name)]]]
                       :breakout [[:expression {:effective-type :type/Integer} "name length"]]
                       :aggregation [[:sum {} [:expression {:effective-type :type/Integer} "increased price"]]]
                       :filters [[:< {} [:expression {:effective-type :type/Integer} "increased price"] 5]
                                 [:> {} [:expression {:effective-type :type/Integer} "name length"] 9]]}
                      {:lib/type :mbql.stage/mbql
                       :filters [[:> {} [:field {:base-type :type/Integer} "sum"] 20]]
                       :order-by [[:desc {} [:field {:base-type :type/Integer} "sum"]]
                                  [:asc {} [:field {:base-type :type/Integer} "name length"]]]}
                      {:lib/type :mbql.stage/mbql
                       :breakout [[:field {:effective-type :type/Integer} "name length"]]}
                      {:lib/type :mbql.stage/mbql}
                      {:lib/type :mbql.stage/mbql
                       :filters [[:< {} [:field {:effective-type :type/Integer} "name length"] 23]]}]}
            replaced))))

(deftest ^:parallel rename-expression-propagation-test
  (let [q         multi-stage-query-with-expressions
        replaced  (lib/replace-clause q 0
                                      (second (lib/expressions q 0))
                                      (lib/with-expression-name
                                        (lib/* (lib/length (meta/field-metadata :venues :name)) 2)
                                        "double name len"))]
    (is (=? {:stages [{:lib/type :mbql.stage/mbql,
                       :expressions [[:* {:lib/expression-name "double price"}
                                      [:field {:effective-type :type/Integer} (meta/id :venues :price)] 2]
                                     [:* {:lib/expression-name "double name len"}
                                      [:length {} [:field {:effective-type :type/Text} (meta/id :venues :name)]] 2]]
                       :filters [[:< {} [:expression {:effective-type :type/Integer} "double price"] 5]
                                 [:> {} [:expression {:effective-type :type/Integer} "double name len"] 9]]
                       :breakout [[:expression {:effective-type :type/Integer} "double name len"]]
                       :aggregation [[:sum {} [:expression {:effective-type :type/Integer} "double price"]]]}
                      {:lib/type :mbql.stage/mbql,
                       :filters [[:> {} [:field {:effective-type :type/Integer} "sum"] 20]]
                       :order-by [[:desc {} [:field {:effective-type :type/Integer} "sum"]]
                                  [:asc {} [:field {:effective-type :type/Integer} "double name len"]]]}
                      {:lib/type :mbql.stage/mbql
                       :breakout [[:field {:effective-type :type/Integer} "double name len"]]}
                      {:lib/type :mbql.stage/mbql}
                      {:lib/type :mbql.stage/mbql
                       :filters [[:< {} [:field {:effective-type :type/Integer} "double name len"] 23]]}]}
            replaced))))

(deftest ^:parallel replace-breakout-propagation-test
  (let [q        multi-stage-query-with-expressions
        replaced (lib/replace-clause q 0
                                     (first (lib/breakouts q 0))
                                     (lib/ref (meta/field-metadata :venues :id)))]
    (is (=? {:stages [{:lib/type :mbql.stage/mbql,
                       :expressions [[:* {:lib/expression-name "double price"}
                                      [:field {:effective-type :type/Integer} (meta/id :venues :price)] 2]
                                     [:length {:lib/expression-name "name length"}
                                      [:field {:base-type :type/Text} (meta/id :venues :name)]]]
                       :filters [[:< {} [:expression {:effective-type :type/Integer} "double price"] 5]
                                 [:> {} [:expression {:effective-type :type/Integer} "name length"] 9]]
                       :breakout [[:field {:effective-type :type/BigInteger}
                                   (meta/id :venues :id)]]
                       :aggregation [[:sum {} [:expression {:effective-type :type/Integer} "double price"]]]}
                      {:lib/type :mbql.stage/mbql,
                       :filters [[:> {} [:field {:effective-type :type/Integer} "sum"] 20]]
                       :order-by [[:desc {} [:field {:effective-type :type/Integer} "sum"]]
                                  [:asc {} [:field {:effective-type :type/BigInteger} "ID"]]]}
                      {:lib/type :mbql.stage/mbql
                       :breakout [[:field {:effective-type :type/BigInteger} "ID"]]}
                      {:lib/type :mbql.stage/mbql}
                      {:lib/type :mbql.stage/mbql
                       :filters [[:< {} [:field {:effective-type :type/BigInteger} "ID"] 23]]}]}
            replaced))))

(deftest ^:parallel replace-aggregation-propagation-test
  (let [q        multi-stage-query-with-expressions
        replaced (lib/replace-clause q 0
                                     (first (lib/aggregations q 0))
                                     (lib/with-expression-name
                                       (lib/min (lib/length (meta/field-metadata :venues :name)))
                                       "min name len"))]
    (is (=? {:stages [{:lib/type :mbql.stage/mbql,
                       :expressions [[:* {:lib/expression-name "double price"}
                                      [:field {:effective-type :type/Integer} (meta/id :venues :price)] 2]
                                     [:length {:lib/expression-name "name length"}
                                      [:field {:base-type :type/Text} (meta/id :venues :name)]]]
                       :filters [[:< {} [:expression {:effective-type :type/Integer} "double price"] 5]
                                 [:> {} [:expression {:effective-type :type/Integer} "name length"] 9]]
                       :breakout [[:expression {:effective-type :type/Integer} "name length"]]
                       :aggregation [[:min {:name           "min name len"
                                            :display-name   "min name len",
                                            :effective-type :type/Integer}
                                      [:length {} [:field {:effective-type :type/Text} (meta/id :venues :name)]]]]}
                      {:lib/type :mbql.stage/mbql,
                       :filters [[:> {} [:field {:effective-type :type/Integer} "min name len"] 20]]
                       :order-by [[:desc {} [:field {:effective-type :type/Integer} "min name len"]]
                                  [:asc {} [:field {:base-type :type/Integer} "name length"]]]}
                      {:lib/type :mbql.stage/mbql
                       :breakout [[:field {:base-type :type/Integer} "name length"]]}
                      {:lib/type :mbql.stage/mbql}
                      {:lib/type :mbql.stage/mbql
                       :filters [[:< {} [:field {:base-type :type/Integer} "name length"] 23]]}]}
            replaced))))

(deftest ^:parallel replace-unrelated-type-test
  (let [people-query (lib/query meta/metadata-provider (meta/table-metadata :people))
        query (as-> people-query q
                (lib/expression q "created at" (meta/field-metadata :people :created-at))
                (lib/filter q (lib/not-null (lib/expression-ref q "created at"))))]
    (testing "replaced when there's no type conflict"
      (is (=? {:stages [{:lib/type :mbql.stage/mbql
                         :expressions [[:field {:effective-type :type/BigInteger, :lib/expression-name "id"}
                                        (meta/id :people :id)]]
                         :filters [[:not-null {} [:expression {:effective-type :type/BigInteger} "id"]]]}]}
              (lib/replace-clause query 0
                                  (first (lib/expressions query 0))
                                  (lib/with-expression-name
                                    (lib/ref (meta/field-metadata :people :id))
                                    "id")))))
    (testing "removed when types conflict"
      (binding [lib.schema.expression/*suppress-expression-type-check?* false]
        (let [query (lib/filter query 0 (lib/= (lib/get-week (lib/expression-ref query "created at") :iso) 3))]
          (is (= 2 (count (lib/filters query 0))))
          (is (=? {:stages [{:lib/type :mbql.stage/mbql
                             :expressions [[:field {:effective-type :type/BigInteger, :lib/expression-name "id"}
                                            (meta/id :people :id)]]
                             :filters [[:not-null {} [:expression {:effective-type :type/BigInteger} "id"]]]}]}
                  (lib/replace-clause query 0
                                      (first (lib/expressions query 0))
                                      (lib/with-expression-name
                                        (lib/ref (meta/field-metadata :people :id))
                                        "id")))))))))

(def ^:private join-query
  (let [products-query (lib/query meta/metadata-provider (meta/table-metadata :products))
        created-at-col (meta/field-metadata :products :created-at)
        products-summarized (-> products-query
                                (lib/breakout (meta/field-metadata :products :category))
                                (lib/breakout (->> (lib/available-temporal-buckets products-query created-at-col)
                                                   (m/find-first (comp #{:month} :unit))
                                                   (lib/with-temporal-bucket created-at-col)))
                                (lib/aggregate (lib/min created-at-col))
                                (lib/aggregate (lib/avg (meta/field-metadata :products :price)))
                                (lib/aggregate (lib/with-expression-name
                                                 (lib/distinct (meta/field-metadata :products :id))
                                                 "product count"))
                                lib/append-stage)
        summarized-cols (lib/returned-columns products-summarized)
        orders-join (-> (lib/join-clause (meta/table-metadata :orders)
                                         [(lib/< (by-desired-alias summarized-cols "min")
                                                 (meta/field-metadata :orders :created-at))])
                        (lib/with-join-fields [(meta/field-metadata :orders :created-at)
                                               (meta/field-metadata :orders :quantity)]))
        joined-query (lib/join products-summarized orders-join)
        joined-query-cols (lib/visible-columns joined-query)]
    (-> joined-query
        (lib/filter (lib/< (by-desired-alias joined-query-cols "Orders - Min of Created At__TOTAL") 100))
        (lib/filter (lib/> (lib/get-month (by-desired-alias joined-query-cols "min")) 6))
        (lib/filter (lib/= (by-desired-alias joined-query-cols "product count") 3)))))

;; TODO: do something about automagic join aliases getting out of date
(deftest ^:parallel replace-unrelated-type-affecting-join-test
  (testing "replaced when there's no type conflict"
    (is (=? {:stages
             [{:breakout [[:field {:effective-type :type/Text} (meta/id :products :category)]
                          [:field {:effective-type :type/DateTimeWithLocalTZ, :temporal-unit :month}
                           (meta/id :products :created-at)]]
               :aggregation [[:max {} [:field {:effective-type :type/DateTimeWithLocalTZ}
                                       (meta/id :products :created-at)]]
                             [:avg {} [:field {:effective-type :type/Float}
                                       (meta/id :products :price)]]
                             [:distinct {:name "product count"} [:field {:effective-type :type/BigInteger}
                                                                 (meta/id :products :id)]]]}
              {:joins [{:stages
                        [{:source-table (meta/id :orders)}],
                        :fields [[:field {:effective-type :type/DateTimeWithLocalTZ
                                          :join-alias "Orders - Min of Created At"}
                                  (meta/id :orders :created-at)]
                                 [:field {:effective-type :type/Integer
                                          :join-alias "Orders - Min of Created At"}
                                  (meta/id :orders :quantity)]],
                        :conditions [[:< {}
                                      [:field {:effective-type :type/DateTimeWithLocalTZ} "max"]
                                      [:field {:effective-type :type/DateTimeWithLocalTZ
                                               :join-alias "Orders - Min of Created At"}
                                       (meta/id :orders :created-at)]]]
                        :alias "Orders - Min of Created At"}]
               :filters [[:< {}
                          [:field {:effective-type :type/Float
                                   :join-alias "Orders - Min of Created At"}
                           (meta/id :orders :total)]
                          100]
                         [:> {} [:get-month {} [:field {:effective-type :type/DateTimeWithLocalTZ} "max"]] 6]
                         [:= {} [:field {:effective-type :type/Integer} "product count"] 3]]}]}
            (lib/replace-clause join-query 0
                                (first (lib/aggregations join-query 0))
                                (lib/max (by-name (lib/orderable-columns join-query 0) "CREATED_AT"))))))
  (testing "removed when types conflict"
    (is (=? {:stages
             [{:breakout [[:field {:effective-type :type/Text} (meta/id :products :category)]
                          [:field {:effective-type :type/DateTimeWithLocalTZ, :temporal-unit :month}
                           (meta/id :products :created-at)]]
               :aggregation [[:min {} [:get-month {} [:field {:effective-type :type/DateTimeWithLocalTZ}
                                                      (meta/id :products :created-at)]]]
                             [:avg {} [:field {:effective-type :type/Float}
                                       (meta/id :products :price)]]
                             [:distinct {:name "product count"} [:field {:effective-type :type/BigInteger}
                                                                 (meta/id :products :id)]]]}
              {}]}
            (lib/replace-clause join-query 0
                                (first (lib/aggregations join-query 0))
                                (lib/min (lib/get-month (by-name (lib/orderable-columns join-query 0) "CREATED_AT"))))))))

(deftest ^:parallel replace-join-condition-updates-alias
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/join (meta/table-metadata :products))
                  (lib/join (-> (meta/table-metadata :products)
                                lib/join-clause
                                (lib/with-join-fields [(meta/field-metadata :products :category)])
                                (lib/with-join-alias "Products_II"))))
        second-join (second (lib/joins query))
        second-joins-condition (first (lib/join-conditions second-join))]
    (is (= ["Products" "Products_II"] (map :alias (lib/joins query))))
    (testing "should rename alias"
      (doseq [[description query] [["when Replacing Join"
                                    (lib/replace-clause
                                     query
                                     second-join
                                     (lib/join-clause (meta/table-metadata :products)
                                                      [(lib/= (meta/field-metadata :orders :user-id)
                                                              (meta/field-metadata :products :id))]))]
                                   ["when Replacing Join using old join"
                                    (lib/replace-clause
                                     query
                                     second-join
                                     (lib/with-join-conditions second-join
                                                               [(lib/= (meta/field-metadata :orders :user-id)
                                                                       (meta/field-metadata :products :id))]))]
                                   ["when Replacing Condition"
                                    (lib/replace-clause
                                     query
                                     second-joins-condition
                                     (lib/= (meta/field-metadata :orders :user-id)
                                            (meta/field-metadata :products :id)))]]]
        (testing description
          (is (= ["Products" "Products - User"]
                 (map :alias (lib/joins query)))))))
    (testing "should not rename alias"
      (doseq [[description new-query] [["when Replacing Join"
                                        (lib/replace-clause
                                         query
                                         second-join
                                         (-> (meta/table-metadata :products)
                                             (lib/join-clause [(lib/= (meta/field-metadata :orders :product-id)
                                                                      (meta/field-metadata :products :id))])
                                             (lib/with-join-fields
                                               [(meta/field-metadata :products :category)])
                                             (lib/with-join-alias "Products_II")))]
                                       ["when Replacing Join using old join"
                                        (lib/replace-clause
                                         query
                                         second-join
                                         (lib/with-join-fields second-join
                                           [(meta/field-metadata :products :id)]))]
                                       ["when Replacing same condition"
                                        (lib/replace-clause
                                         query
                                         second-joins-condition
                                         (lib/= (meta/field-metadata :orders :product-id)
                                                (meta/field-metadata :products :id)))]]]
        (testing description
          (is (= ["Products" "Products_II"]
                 (map :alias (lib/joins new-query)))))))))

(deftest ^:parallel replaced-join-gets-updated-alias-even-with-fks-to-same-field-test
  (testing "replaced join gets replaced alias even if the replaced fk points to the same field (#40676)"
    (let [orig-query (-> (lib/query meta/metadata-provider (meta/table-metadata :ic/reports))
                         (lib/join (lib/join-clause (meta/table-metadata :ic/accounts)
                                                    [(lib/= (meta/field-metadata :ic/reports :created-by)
                                                            (meta/field-metadata :ic/accounts :id))])))
          [orig-join] (lib/joins orig-query)
          ;; This simulates how the FE updates the join via lib/with-join-conditions and lib/replace-clause.
          new-query  (lib/replace-clause orig-query orig-join (lib/with-join-conditions
                                                               orig-join
                                                               [(lib/= (meta/field-metadata :ic/reports :updated-by)
                                                                       (meta/field-metadata :ic/accounts :id))]))
          [new-join] (lib/joins new-query)
          id->breakout-name (fn [query id]
                              (->> query
                                   lib/breakoutable-columns
                                   (m/find-first #(= id (:id %)))
                                   (lib/display-info query)
                                   :long-display-name))
          orig-name  (id->breakout-name orig-query (meta/id :ic/accounts :name))
          new-name   (id->breakout-name new-query (meta/id :ic/accounts :name))]
      (testing "join gets correct join alias"
        (is (= "IC Accounts - Created By" (:alias orig-join)))
        (is (= "IC Accounts - Updated By" (:alias new-join))))
      (testing "breakoutable columns have correct long display name"
        (is (= "IC Accounts - Created By → Name" orig-name))
        (is (= "IC Accounts - Updated By → Name" new-name))))))

(deftest ^:parallel stale-clauses-test-unrelated-refs-are-stable
  (testing "deleting eg. an aggregation should not break a downstream ref to a breakout (#59441)"
    (let [base1  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                     (lib/join (meta/table-metadata :products))
                     (lib/aggregate (lib/count))
                     (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal))))
          cols   (m/index-by :lib/desired-column-alias
                             (into []
                                   (lib.field.util/add-source-and-desired-aliases-xform base1)
                                   (lib/breakoutable-columns base1)))
          base2  (-> base1
                     (lib/breakout (get cols "Products__CATEGORY"))           ; Explicitly joined
                     (lib/breakout (get cols "PEOPLE__via__USER_ID__SOURCE")) ; Implicitly joined
                     lib/append-stage)
          [category] (lib/visible-columns base2)
          ;; Adding an expression based on one of the breakouts.
          query      (lib/expression base2 "WidgetOrNah" (lib/case [[(lib/= category "Widget") "Widget!"]] "Nah"))
          [cnt sum]  (lib/aggregations query 0)]
      (is (=? [:count {}]
              cnt))
      (is (=? [:sum {} [:field {} (meta/id :orders :subtotal)]]
              sum))
      (is (=? (update-in query [:stages 0 :aggregation] (comp vector first))
              (lib/remove-clause query 0 sum)))
      (is (=? (update-in query [:stages 0 :aggregation] (comp vec rest))
              (lib/remove-clause query 0 cnt))))))

(deftest ^:parallel stale-clauses-test-no-capture-of-later-aggregations
  (testing "deleting an aggregation in stage 0 should not delete refs to a similar aggregation in stage 1"
    (let [base1                     (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                                        (lib/join (meta/table-metadata :products))
                                        (lib/aggregate (lib/count))
                                        (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal))))
          cols                      (m/index-by
                                     :lib/desired-column-alias
                                     (into []
                                           (lib.field.util/add-source-and-desired-aliases-xform base1)
                                           (lib/breakoutable-columns base1)))
          base2                     (-> base1
                                        (lib/breakout (get cols "Products__CATEGORY"))             ; Explicitly joined
                                        (lib/breakout (get cols "PEOPLE__via__USER_ID__SOURCE"))   ; Implicitly joined
                                        lib/append-stage)
          [category _source count0] (lib/visible-columns base2)
          ;; Adding a second stage with: a filter on stage 0's count, its own count aggregation, and order-by
          ;; (stage 1's) count, descending.
          base3                     (-> base2
                                        (lib/filter (lib/> count0 100))
                                        (lib/aggregate (lib/count))
                                        (lib/breakout category))
          [_cat1 cnt1]              (lib/orderable-columns base3)
          query                     (lib/order-by base3 cnt1 :desc)
          [cnt0]                    (lib/aggregations query 0)]
      (is (=? [:count {}]
              cnt0))
      ;; Deleting the :count aggregation from stage 0 should:
      ;; - Removing the filter on stage 1, which references the :count from stage 0.
      ;; - Preserve the order-by on stage 1, which references the :count from stage 1.
      (is (=? (-> query
                  (update-in [:stages 0 :aggregation] (comp vec rest))
                  (update-in [:stages 1] dissoc :filters))
              (lib/remove-clause query 0 cnt0))))))
