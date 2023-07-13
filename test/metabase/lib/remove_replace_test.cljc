(ns metabase.lib.remove-replace-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel remove-clause-order-bys-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/order-by (meta/field-metadata :venues :name))
                  (lib/order-by (meta/field-metadata :venues :name)))
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
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
                  (lib/filters))))))

(deftest ^:parallel remove-clause-join-conditions-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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

(deftest ^:parallel remove-clause-breakout-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/breakout (meta/field-metadata :venues :id))
                  (lib/breakout (meta/field-metadata :venues :name)))
        breakouts (lib/breakouts query)]
    (is (= 2 (count breakouts)))
    (is (= 1 (-> query
                 (lib/remove-clause (first breakouts))
                 (lib/breakouts)
                 count)))
    (is (nil? (-> query
                  (lib/remove-clause (first breakouts))
                  (lib/remove-clause (second breakouts))
                  (lib/breakouts))))
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
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
                  (lib/join (-> (lib/join-clause (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
                    (lib/join (-> (lib/join-clause (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
                   :fields :all
                   :alias "Venues"}]}]}
              (lib/replace-clause query'
                                  (first aggs)
                                  (lib/avg (lib/length (meta/field-metadata :categories :name)))))))))

(deftest ^:parallel remove-clause-aggregation-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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

(deftest ^:parallel remove-clause-expression-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/filter (lib/= "myvenue" (meta/field-metadata :venues :name)))
                  (lib/order-by (meta/field-metadata :venues :name))
                  (lib/order-by (meta/field-metadata :venues :name)))
        order-bys (lib/order-bys query)]
    (is (= 2 (count order-bys)))
    (let [replaced (-> query
                       (lib/replace-clause (first order-bys) (lib/order-by-clause (meta/field-metadata :venues :id))))
          replaced-order-bys (lib/order-bys replaced)]
      (is (not= order-bys replaced-order-bys))
      (is (=? [:asc {} [:field {} (meta/id :venues :id)]]
              (first replaced-order-bys)))
      (is (= 2 (count replaced-order-bys)))
      (is (= (second order-bys) (second replaced-order-bys))))))

(deftest ^:parallel replace-clause-filters-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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

(deftest ^:parallel replace-clause-fields-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
    (testing "replacing with dependent should cascade"
      (is (=? {:stages [{:aggregation [[:sum {} [:field {} (meta/id :venues :price)]]
                                       (second aggregations)]
                         :expressions (symbol "nil #_\"key is not present.\"")}
                        (complement :filters)]}
              (-> query
                  (as-> <> (lib/expression <> "expr" (lib/aggregation-ref <> 0)))
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "sum"] 1))
                  (lib/replace-clause 0 (first aggregations) (lib/sum (meta/field-metadata :venues :price))))))))
  (testing "replacing with metric should work"
    (let [metadata-provider (lib.tu/mock-metadata-provider
                              {:database meta/metadata
                               :tables   [(meta/table-metadata :venues)]
                               :fields   [(meta/field-metadata :venues :price)]
                               :metrics  [{:id          100
                                           :name        "Sum of Cans"
                                           :table-id    (meta/id :venues)
                                           :definition  {:source-table (meta/id :venues)
                                                         :aggregation  [[:sum [:field (meta/id :venues :price) nil]]]
                                                         :filter       [:= [:field (meta/id :venues :price) nil] 4]}
                                           :description "Number of toucans plus number of pelicans"}]})
          query (-> (lib/query metadata-provider (meta/table-metadata :venues))
                    (lib/aggregate (lib/count)))]
      (is (=? {:stages [{:aggregation [[:metric {:lib/uuid string?} 100]]}]}
              (lib/replace-clause
                query
                (first (lib/aggregations query))
                (first (lib/available-metrics query)))))
      (is (=? {:stages [{:aggregation [[:count {:lib/uuid string?}]]}]}
              (-> query
                  (lib/replace-clause
                    (first (lib/aggregations query))
                    (first (lib/available-metrics query)))
                  (as-> $q (lib/replace-clause $q (first (lib/aggregations $q)) (lib/count)))))))))

(deftest ^:parallel replace-clause-expression-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
      (let [query (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
      (let [query (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
      (let [query (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
      (let [query (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
