(ns metabase.lib.remove-replace-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.dev :as lib.dev]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel remove-clause-order-bys-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/order-by (lib/field (meta/id :venues :name)))
                  (lib/order-by (lib/field (meta/id :venues :name))))
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
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/filter (lib/= (lib/field "VENUES" "PRICE") 4))
                  (lib/filter (lib/= (lib/field "VENUES" "NAME") "x")))
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
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/join (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
                            [(lib/= (lib/field "VENUES" "PRICE") 4)
                             (lib/= (lib/field "VENUES" "NAME") "x")]))
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
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/breakout (lib/field "VENUES" "ID"))
                  (lib/breakout (lib/field "VENUES" "NAME")))
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
                ;; TODO Should be able to create a ref with lib/field [#29763]
                (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                (lib/remove-clause 0 (first breakouts)))))
      (is (=? {:stages [{:breakout [(second breakouts)]}
                        (complement :fields)
                        (complement :filters)]}
            (-> query
                (lib/append-stage)
                (lib/with-fields [[:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"]])
                (lib/append-stage)
                ;; TODO Should be able to create a ref with lib/field [#29763]
                (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                (lib/remove-clause 0 (first breakouts)))))
      (is (nil? (-> query
                    (lib/remove-clause 0 (second breakouts))
                    (lib/append-stage)
                    ;; TODO Should be able to create a ref with lib/field [#29763]
                    (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                    (lib/remove-clause 0 (first breakouts))
                    (lib/breakouts 0)))))))

(deftest ^:parallel remove-clause-fields-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/expression "myadd" (lib/+ 1 (lib/field "VENUES" "CATEGORY_ID")))
                  (lib/with-fields [(lib/field "VENUES" "ID") (lib/field "VENUES" "NAME")]))
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
                ;; TODO Should be able to create a ref with lib/field [#29763]
                (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                (lib/remove-clause 0 (first fields)))))
      (is (=? {:stages [{:fields (rest fields)}
                        (complement :fields)
                        (complement :filters)]}
              (-> query
                (lib/append-stage)
                (lib/with-fields [[:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"]])
                (lib/append-stage)
                ;; TODO Should be able to create a ref with lib/field [#29763]
                (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                (lib/remove-clause 0 (first fields)))))
      (is (nil? (-> query
                   (lib/remove-clause 0 (second fields))
                   (lib/append-stage)
                   ;; TODO Should be able to create a ref with lib/field [#29763]
                   (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                   (lib/remove-clause 0 (first fields))
                   (lib/fields 0)))))))

(deftest ^:parallel remove-clause-join-fields-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
                  (lib/join (-> (lib/join-clause (lib/query-for-table-name meta/metadata-provider "VENUES")
                                                 [(lib/= (lib/field "VENUES" "PRICE") 4)])
                                (lib/with-join-fields [(lib/field "VENUES" "PRICE")
                                                       (lib/field "VENUES" "ID")]))))
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
                  ;; TODO Should be able to create a ref with lib/field [#29763]
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "Venues__PRICE"] 1))
                  (lib/remove-clause 0 (first fields)))))
      (is (=? {:stages [{:joins [{:fields [(second fields)]}]} (complement :fields) (complement :filters)]}
            (-> query
                (lib/append-stage)
                (lib/with-fields [[:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "Venues__PRICE"]])
                (lib/append-stage)
                ;; TODO Should be able to create a ref with lib/field [#29763]
                (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "Venues__PRICE"] 1))
                (lib/remove-clause 0 (first fields))))))))

(deftest ^:parallel remove-clause-aggregation-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/aggregate (lib/sum (lib/field "VENUES" "ID")))
                  (lib/aggregate (lib/sum (lib/field "VENUES" "PRICE"))))
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
                  (lib/order-by (lib.dev/ref-lookup :aggregation 0))
                  (lib/append-stage)
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "sum"] 1))
                  (lib/remove-clause 0 (first aggregations))))))))

(deftest ^:parallel remove-clause-expression-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/expression "a" (lib/field "VENUES" "ID"))
                  (lib/expression "b" (lib/field "VENUES" "PRICE")))
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
                (lib/order-by (lib.dev/ref-lookup :expression "a"))
                (lib/append-stage)
                (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "a"] 1))
                (lib/remove-clause 0 expr-a)))))))

(deftest ^:parallel replace-clause-order-by-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/filter (lib/= "myvenue" (lib/field (meta/id :venues :name))))
                  (lib/order-by (lib/field (meta/id :venues :name)))
                  (lib/order-by (lib/field (meta/id :venues :name))))
        order-bys (lib/order-bys query)]
    (is (= 2 (count order-bys)))
    (let [replaced (-> query
                       (lib/replace-clause (first order-bys) (lib/order-by-clause (lib/field (meta/id :venues :id)))))
          replaced-order-bys (lib/order-bys replaced)]
      (is (not= order-bys replaced-order-bys))
      (is (=? [:asc {} [:field {} (meta/id :venues :id)]]
              (first replaced-order-bys)))
      (is (= 2 (count replaced-order-bys)))
      (is (= (second order-bys) (second replaced-order-bys))))))

(deftest ^:parallel replace-clause-filters-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/filter (lib/= (lib/field (meta/id :venues :name)) "myvenue"))
                  (lib/filter (lib/= (lib/field (meta/id :venues :price)) 2)))
        filters (lib/filters query)]
    (is (= 2 (count filters)))
    (let [replaced (-> query
                       (lib/replace-clause (first filters) (lib/= (lib/field (meta/id :venues :id)) 1)))
          replaced-filters (lib/filters replaced)]
      (is (not= filters replaced-filters))
      (is (=? [:= {} [:field {} (meta/id :venues :id)] 1]
              (first replaced-filters)))
      (is (= 2 (count replaced-filters)))
      (is (= (second filters) (second replaced-filters))))))

(deftest ^:parallel replace-clause-join-conditions-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/join (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
                            [(lib/= (lib/field "VENUES" "PRICE") 4)]))
        conditions (lib/join-conditions (first (lib/joins query)))]
    (is (= 1 (count conditions)))
    (let [replaced (-> query
                       (lib/replace-clause (first conditions) (lib/= (lib/field (meta/id :venues :id)) 1)))
          replaced-conditions (lib/join-conditions (first (lib/joins replaced)))]
      (is (not= conditions replaced-conditions))
      (is (=? [:= {} [:field {} (meta/id :venues :id)] 1]
              (first replaced-conditions)))
      (is (= 1 (count replaced-conditions)))
      (is (= (second conditions) (second replaced-conditions))))))

(deftest ^:parallel replace-clause-join-fields-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/join
                    (-> (lib/join-clause (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
                                         [(lib/= (lib/field "VENUES" "PRICE") 4)])
                        (lib/with-join-fields
                          [(lib/field "CATEGORIES" "ID")]))))
        fields (lib/join-fields (first (lib/joins query)))]
    (is (= 1 (count fields)))
    (let [replaced (-> query
                       (lib/replace-clause (first fields) (lib/field "CATEGORIES" "NAME")))
          replaced-fields (lib/join-fields (first (lib/joins replaced)))]
      (is (not= fields replaced-fields))
      (is (=? [:field {} (meta/id :categories :name)]
              (first replaced-fields)))
      (is (= 1 (count fields)))
      (is (= 1 (count replaced-fields))))))

(deftest ^:parallel replace-clause-breakout-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/breakout (lib/field (meta/id :venues :id)))
                  (lib/breakout (lib/field (meta/id :venues :name))))
        breakouts (lib/breakouts query)
        replaced (-> query
                     (lib/replace-clause (first breakouts) (lib/field (meta/id :venues :price))))
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
                  ;; TODO Should be able to create a ref with lib/field [#29763]
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                  (lib/replace-clause 0 (first breakouts) (lib/field "VENUES" "PRICE")))))
      (is (not= breakouts (-> query
                              (lib/append-stage)
                              ;; TODO Should be able to create a ref with lib/field [#29763]
                              (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                              (lib/replace-clause 0 (second breakouts) (lib/field "VENUES" "PRICE"))
                              (lib/breakouts 0)))))))

(deftest ^:parallel replace-clause-fields-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/with-fields [(lib/field (meta/id :venues :id)) (lib/field (meta/id :venues :name))]))
        fields (lib/fields query)
        replaced (-> query
                     (lib/replace-clause (first fields) (lib/field (meta/id :venues :price))))
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
                  ;; TODO Should be able to create a ref with lib/field [#29763]
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                  (lib/replace-clause 0 (first fields) (lib/field "VENUES" "PRICE")))))
      (is (not= fields (-> query
                           (lib/append-stage)
                           ;; TODO Should be able to create a ref with lib/field [#29763]
                           (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                           (lib/replace-clause 0 (second fields) (lib/field "VENUES" "PRICE"))
                           (lib/fields 0)))))))

(deftest ^:parallel replace-clause-aggregation-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/aggregate (lib/sum (lib/field (meta/id :venues :id))))
                  (lib/aggregate (lib/distinct (lib/field (meta/id :venues :name)))))
        aggregations (lib/aggregations query)
        replaced (-> query
                     (lib/replace-clause (first aggregations) (lib/sum (lib/field (meta/id :venues :price)))))
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
                  (lib/expression "expr" (lib.dev/ref-lookup :aggregation 0))
                  (lib/append-stage)
                  ;; TODO Should be able to create a ref with lib/field [#29763]
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "sum"] 1))
                  (lib/replace-clause 0 (first aggregations) (lib/sum (lib/field "VENUES" "PRICE")))))))))

(deftest ^:parallel replace-clause-expression-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/expression "a" (lib/field (meta/id :venues :id)))
                  (lib/expression "b" (lib/field (meta/id :venues :name))))
        [expr-a expr-b :as expressions] (lib/expressions query)
        replaced (-> query
                     (lib/replace-clause expr-a (lib/field (meta/id :venues :price))))
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
                  (lib/aggregate (lib/sum (lib.dev/ref-lookup :expression "a")))
                  (lib/with-fields [(lib.dev/ref-lookup :expression "a")])
                  (lib/append-stage)
                  ;; TODO Should be able to create a ref with lib/field [#29763]
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "a"] 1))
                  (lib/replace-clause 0 expr-a (lib/field "VENUES" "PRICE"))))))
    (testing "replace with literal expression"
      (is (=? {:stages [{:expressions [[:value {:lib/expression-name "a" :effective-type :type/Integer} 999]
                                       expr-b]}]}
              (-> query
                  (lib/replace-clause 0 expr-a 999)))))))

(deftest ^:parallel replace-order-by-breakout-col-test
  (testing "issue #30980"
    (testing "Bucketing should keep order-by in sync"
      (let [query (lib/query-for-table-name meta/metadata-provider "USERS")
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
      (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")
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
      (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")
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
      (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")
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
      (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")
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
