(ns metabase.lib.remove-replace-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
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
    (is (= 0 (-> query
                 (lib/remove-clause (first order-bys))
                 (lib/remove-clause (second order-bys))
                 (lib/order-bys)
                 count)))))

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
    (is (= 0 (-> query
                 (lib/remove-clause (first breakouts))
                 (lib/remove-clause (second breakouts))
                 (lib/breakouts)
                 count)))
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
      (is (= 0 (-> query
                   (lib/remove-clause 0 (second breakouts))
                   (lib/append-stage)
                   ;; TODO Should be able to create a ref with lib/field [#29763]
                   (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                   (lib/remove-clause 0 (first breakouts))
                   (lib/breakouts 0)
                   count))))))

(deftest ^:parallel remove-clause-fields-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/with-fields [(lib/field "VENUES" "ID") (lib/field "VENUES" "NAME")]))
        fields (lib/fields query)]
    (is (= 2 (count fields)))
    (is (= 1 (-> query
                 (lib/remove-clause (first fields))
                 (lib/fields)
                 count)))
    (is (= 0 (-> query
                 (lib/remove-clause (first fields))
                 (lib/remove-clause (second fields))
                 (lib/fields)
                 count)))
    (testing "removing with dependent should cascade"
      (is (=? {:stages [{:fields [(second fields)]} (complement :filters)]}
              (-> query
                (lib/append-stage)
                ;; TODO Should be able to create a ref with lib/field [#29763]
                (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                (lib/remove-clause 0 (first fields)))))
      (is (=? {:stages [{:fields [(second fields)]}
                        (complement :fields)
                        (complement :filters)]}
              (-> query
                (lib/append-stage)
                (lib/with-fields [[:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"]])
                (lib/append-stage)
                ;; TODO Should be able to create a ref with lib/field [#29763]
                (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                (lib/remove-clause 0 (first fields)))))
      (is (= 0 (-> query
                   (lib/remove-clause 0 (second fields))
                   (lib/append-stage)
                   ;; TODO Should be able to create a ref with lib/field [#29763]
                   (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "ID"] 1))
                   (lib/remove-clause 0 (first fields))
                   (lib/fields 0)
                   count))))))

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
    (is (= 0 (-> query
                 (lib/remove-clause (first aggregations))
                 (lib/remove-clause (second aggregations))
                 (lib/aggregations)
                 count)))
    (testing "removing with dependent should cascade"
      (is (=? {:stages [{:aggregation [(second aggregations)] :order-by (symbol "nil #_\"key is not present.\"")}
                        (complement :filters)]}
              (-> query
                (lib/order-by (lib.dev/ref-lookup :aggregation 0))
                (lib/append-stage)
                (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "sum_ID"] 1))
                (lib/remove-clause 0 (first aggregations))))))))

(deftest ^:parallel remove-clause-expression-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/expression "a" (lib/field "VENUES" "ID"))
                  (lib/expression "b" (lib/field "VENUES" "PRICE")))
        {expr-a "a" expr-b "b" :as expressions} (lib/expressions query)]
    (is (= 2 (count expressions)))
    (is (= 1 (-> query
                 (lib/remove-clause expr-a)
                 (lib/expressions)
                 count)))
    (is (= 0 (-> query
                 (lib/remove-clause expr-a)
                 (lib/remove-clause expr-b)
                 (lib/expressions)
                 count)))
    (testing "removing with dependent should cascade"
      (is (=? {:stages [{:expressions {"b" expr-b} :order-by (symbol "nil #_\"key is not present.\"")}
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
      (is (=? {:operator "=" :args [[:field {} (meta/id :venues :id)] 1]}
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
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "sum_ID"] 1))
                  (lib/replace-clause 0 (first aggregations) (lib/sum (lib/field "VENUES" "PRICE")))))))))

(deftest ^:parallel replace-clause-expression-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/expression "a" (lib/field (meta/id :venues :id)))
                  (lib/expression "b" (lib/field (meta/id :venues :name))))
        {expr-a "a" expr-b "b" :as expressions} (lib/expressions query)
        replaced (-> query
                     (lib/replace-clause expr-a (lib/field (meta/id :venues :price))))
        {_repl-expr-a "a" repl-expr-b "b" :as replaced-expressions} (lib/expressions replaced)]
    (is (= 2 (count expressions)))
    (is (=? {"a" [:field {} (meta/id :venues :price)]}
            replaced-expressions))
    (is (not= expressions replaced-expressions))
    (is (= 2 (count replaced-expressions)))
    (is (= expr-b repl-expr-b))
    (testing "replacing with dependent should cascade"
      (is (=? {:stages [{:aggregation (symbol "nil #_\"key is not present.\"")
                         :expressions {"a" [:field {} (meta/id :venues :price)]
                                       "b" expr-b}}
                        (complement :filters)]}
              (-> query
                  (lib/aggregate (lib/sum (lib.dev/ref-lookup :expression "a")))
                  (lib/with-fields [(lib.dev/ref-lookup :expression "a")])
                  (lib/append-stage)
                  ;; TODO Should be able to create a ref with lib/field [#29763]
                  (lib/filter (lib/= [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "a"] 1))
                  (lib/replace-clause 0 expr-a (lib/field "VENUES" "PRICE"))))))))
