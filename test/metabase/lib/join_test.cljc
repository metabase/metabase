(ns metabase.lib.join-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel join-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :joins        [{:lib/type    :mbql/join
                                       :lib/options {:lib/uuid string?}
                                       :alias       "Categories"
                                       :stages      [{:lib/type     :mbql.stage/mbql
                                                      :source-table (meta/id :categories)}]
                                       :conditions  [[:=
                                                      {:lib/uuid string?}
                                                      [:field
                                                       {:lib/uuid string?
                                                        :join-alias (symbol "nil #_\"key is not present.\"")}
                                                       (meta/id :venues :category-id)]
                                                      [:field
                                                       {:lib/uuid string?
                                                        :join-alias "Categories"}
                                                       (meta/id :categories :id)]]]
                                       :fields      :all}]}]}
          (let [q lib.tu/venues-query
                j (lib/query meta/metadata-provider (meta/table-metadata :categories))]
            (lib/join q (lib/join-clause j [{:lib/type :lib/external-op
                                             :operator :=
                                             :args     [(lib/ref (meta/field-metadata :venues :category-id))
                                                        (lib/ref (meta/field-metadata :categories :id))]}]))))))

(deftest ^:parallel join-clause-test
  (testing "Should have :fields :all by default (#32419)"
    (is (=? {:lib/type    :mbql/join
             :stages      [{:lib/type     :mbql.stage/mbql
                            :source-table (meta/id :orders)}]
             :lib/options {:lib/uuid string?}
             :fields      :all}
            (lib/join-clause (meta/table-metadata :orders)))))
  (testing "source-card"
    (let [query {:lib/type :mbql/query
                 :lib/metadata lib.tu/metadata-provider-with-mock-cards
                 :database (meta/id)
                 :stages [{:lib/type :mbql.stage/mbql
                           :source-card (:id (lib.tu/mock-cards :orders))}]}
          product-card (lib.tu/mock-cards :products)
          [_ orders-product-id] (lib/join-condition-lhs-columns query product-card nil nil)
          [products-id] (lib/join-condition-rhs-columns query product-card orders-product-id nil)]
      (is (=? {:stages [{:joins [{:stages [{:source-card (:id product-card)}]}]}]}
          (lib/join query (lib/join-clause product-card [(lib/= orders-product-id products-id)]))))))
  (testing "source-table"
    (let [query {:lib/type :mbql/query
                 :lib/metadata lib.tu/metadata-provider-with-mock-cards
                 :database (meta/id)
                 :stages [{:lib/type :mbql.stage/mbql
                           :source-card (:id (lib.tu/mock-cards :orders))}]}
          product-table (meta/table-metadata :products)
          [_ orders-product-id] (lib/join-condition-lhs-columns query product-table nil nil)
          [products-id] (lib/join-condition-rhs-columns query product-table orders-product-id nil)]
      (is (=? {:stages [{:joins [{:stages [{:source-table (:id product-table)}]}]}]}
              (lib/join query (lib/join-clause product-table [(lib/= orders-product-id products-id)])))))))

(deftest ^:parallel join-saved-question-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :categories)
                       :joins        [{:lib/type    :mbql/join
                                       :lib/options {:lib/uuid string?}
                                       :alias       "Venues"
                                       :stages      [{:lib/type     :mbql.stage/mbql
                                                      :source-table (meta/id :venues)}]
                                       :conditions  [[:=
                                                      {:lib/uuid string?}
                                                      [:field
                                                       {:lib/uuid string?
                                                        :join-alias (symbol "nil #_\"key is not present.\"")}
                                                       (meta/id :categories :id)]
                                                      [:field
                                                       {:lib/uuid string?
                                                        :join-alias "Venues"}
                                                       (meta/id :venues :category-id)]]]}]}]}
          (-> (lib/query meta/metadata-provider (meta/table-metadata :categories))
              (lib/join (lib/join-clause
                         (lib/saved-question-query meta/metadata-provider meta/saved-question)
                         [(lib/= (meta/field-metadata :categories :id)
                                 (meta/field-metadata :venues :category-id))]))
              (dissoc :lib/metadata)))))

(deftest ^:parallel join-a-table-test
  (testing "As a convenience, we should support calling `join` with a Table metadata and do the right thing automatically"
    (is (=? {:stages [{:source-table (meta/id :orders)
                       :joins        [{:stages     [{:source-table (meta/id :products)}]
                                       :fields     :all
                                       :alias      "Products"
                                       :conditions [[:=
                                                     {}
                                                     [:field {} (meta/id :orders :product-id)]
                                                     [:field {:join-alias "Products"} (meta/id :products :id)]]]}]}]}
            (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                (lib/join (meta/table-metadata :products)))))
    (testing "with reverse PK <- FK relationship"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :joins        [{:stages     [{:source-table (meta/id :orders)}]
                                         :fields     :all
                                         :alias      "Orders"
                                         :conditions [[:=
                                                       {}
                                                       [:field {} (meta/id :products :id)]
                                                       [:field {:join-alias "Orders"} (meta/id :orders :product-id)]]]}]}]}
              (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                  (lib/join (meta/table-metadata :orders))))))))
