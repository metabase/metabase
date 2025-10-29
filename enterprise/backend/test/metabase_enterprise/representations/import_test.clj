(ns metabase-enterprise.representations.import-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest order-representations-self-reference-test
  (testing "order-representations throws exception when representation refers to itself"
    (let [reps [{:name "a" :database "ref:a"}]
          result-future (future (try
                                  (import/order-representations reps)
                                  (catch Exception e e)))
          result (deref result-future 100 ::timeout)]
      (future-cancel result-future)
      (is (instance? Exception result)
          "Expected exception to be thrown")
      (is (not= ::timeout result) "order-representations took longer than 100ms, likely infinite loop"))))

(deftest order-representations-circular-reference-test
  (testing "order-representations throws exception when representations have circular dependency"
    (let [reps [{:name "a" :database "ref:b"}
                {:name "b" :database "ref:a"}]
          result-future (future (try
                                  (import/order-representations reps)
                                  (catch Exception e e)))
          result (deref result-future 100 ::timeout)]
      (future-cancel result-future)
      (is (instance? Exception result)
          "Expected exception to be thrown")
      (is (not= ::timeout result) "order-representations took longer than 100ms, likely infinite loop"))))

(deftest order-representations-empty-test
  (testing "order-representations handles empty list"
    (let [result-future (future (try
                                  (import/order-representations [])
                                  (catch Exception e e)))
          result (deref result-future 100 ::timeout)]
      (future-cancel result-future)
      (is (= [] result)))))

(deftest order-representations-chain-test
  (testing "order-representations orders chain correctly"
    (let [reps [{:name "a" :type :question :table-ref "ref:b"}
                {:name "b" :type :model :database "ref:d"}
                {:name "c" :type :model :database "ref:d"}
                {:name "d" :type :database}]
          result-future (future (try
                                  (import/order-representations reps)
                                  (catch Exception e e)))
          ordered (deref result-future 100 ::timeout)
          refs (mapv :name ordered)]
      (future-cancel result-future)
      (is (= ["d" "c" "b" "a"] refs)))))

(deftest order-representations-test
  (let [x [{:name "database-1",
            :type :database,
            :version :v0,
            :engine :h2,
            :display_name "Sample Database",
            :description "Some example data for you to play around with.",
            :connection_details
            {:db "file:/Users/ericnormand/code/metabase/plugins/sample-database.db;USER=GUEST;PASSWORD=guest"},
            :schemas
            [{:name "PUBLIC",
              :tables
              [{:name "ORDERS",
                :description "Confirmed Sample Company orders for a product, from a user.",
                :columns
                [{:name "QUANTITY", :type "INTEGER", :description "Number of products bought.", :nullable true}
                 {:name "DISCOUNT", :type "DOUBLE PRECISION", :description "Discount amount.", :nullable true}
                 {:name "TOTAL", :type "DOUBLE PRECISION", :description "The total billed amount.", :nullable true}
                 {:name "ID",
                  :type "BIGINT",
                  :description
                  "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.",
                  :nullable true}
                 {:name "SUBTOTAL",
                  :type "DOUBLE PRECISION",
                  :description
                  "The raw, pre-tax cost of the order. Note that this might be different in the future from the product price due to promotions, credits, etc.",
                  :nullable true}
                 {:name "USER_ID",
                  :type "INTEGER",
                  :description
                  "The id of the user who made this order. Note that in some cases where an order was created on behalf of a customer who phoned the order in, this might be the employee who handled the request.",
                  :nullable true,
                  :fk "PEOPLE.ID"}
                 {:name "CREATED_AT",
                  :type "TIMESTAMP",
                  :description "The date and time an order was submitted.",
                  :nullable true}
                 {:name "PRODUCT_ID",
                  :type "INTEGER",
                  :description "The product ID. This is an internal identifier for the product, NOT the SKU.",
                  :nullable true,
                  :fk "PRODUCTS.ID"}
                 {:name "TAX",
                  :type "DOUBLE PRECISION",
                  :description
                  "This is the amount of local and federal taxes that are collected on the purchase. Note that other governmental fees on some products are not included here, but instead are accounted for in the subtotal.",
                  :nullable true}]}]}]}
           {:name "transform-26",
            :type :transform,
            :version :v0,
            :entity_id "q1zWv69ebx6nF4Pq0OGBE",
            :display_name "Orders count by month (transform)",
            :description "",
            :database "ref:database-1",
            :target_table {:schema "PUBLIC", :table "ORDERS_COUNT"},
            :lib_query
            [{:lib/type :mbql.stage/mbql,
              :source-table {:database "ref:database-1", :schema "PUBLIC", :table "ORDERS"},
              :aggregation [[:count {:lib/uuid "8b980f80-1b7e-4f46-9c85-72f7d89d96bf"}]],
              :breakout [{:database "ref:database-1", :schema "PUBLIC", :table "ORDERS", :field "CREATED_AT"}]}]}]]
    (is (import/order-representations x))))
