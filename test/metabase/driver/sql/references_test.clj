;; TODO move this into sql tools and refactor
(ns metabase.driver.sql.references-test
  (:require
   [clojure.test :refer :all]
   [macaw.core :as macaw]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.sql.references :as sql.references]))

(defn- ->references [query]
  (->> query macaw/parsed-query macaw/->ast (sql.references/field-references :sql)))

(deftest ^:parallel garbage-test
  (is (= {:used-fields #{}
          :returned-fields []
          :errors #{(driver-api/syntax-error)}}
         (->references "nothing"))))

(deftest ^:parallel basic-select-test
  (is (= {:used-fields
          #{{:column "a",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "products"}}]]}
            {:column "b",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "products"}}]]}},
          :returned-fields
          [{:column "a",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns, :table {:table "products"}}]]}
           {:column "b",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns, :table {:table "products"}}]]}]
          :errors #{}}
         (->references "select * from (select a, b from products)"))))

(deftest ^:parallel basic-join-test
  (is (= {:used-fields
          #{{:column "product_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "orders"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "products"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "orders"}}]]}},
          :returned-fields
          [{:type :all-columns, :table {:table "products"}}
           {:column "id",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns, :table {:table "orders"}}]]}]
          :errors #{}}
         (->references "select products.*, orders.id from products inner join orders on products.id = orders.product_id"))))

(deftest ^:parallel indeterminite-join-test
  (is (= {:used-fields
          #{{:column "id",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns, :table {:table "orders"}}
               {:type :all-columns, :table {:table "products"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "products"}}]]}
            {:column "product_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "orders"}}]]}},
          :returned-fields
          [{:column "id",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns, :table {:table "orders"}}
              {:type :all-columns, :table {:table "products"}}]]}]
          :errors #{}}
         (->references "select id from products inner join orders on products.id = orders.product_id"))))

(deftest ^:parallel table-wildcard-join-test
  (is (= {:used-fields
          #{{:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}
            {:column "product_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "orders"}}]]}},
          :returned-fields
          [{:type :all-columns, :table {:table "orders"}}]
          :errors #{}}
         (->references "select orders.* from products inner join orders on products.id = orders.product_id"))))

(deftest ^:parallel wildcard-join-test
  (is (= {:used-fields
          #{{:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}
            {:column "product_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "orders"}}]]}},
          :returned-fields
          [{:type :all-columns, :table {:table "orders"}}
           {:type :all-columns, :table {:table "products"}}]
          :errors #{}}
         (->references "select * from products inner join orders on products.id = orders.product_id"))))

(deftest ^:parallel basic-alias-test
  (is (= {:used-fields
          #{{:column "c",
             :alias "d",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table-alias "p", :table "products"}}]]}
            {:column "a",
             :alias "b",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table-alias "p", :table "products"}}]]}},
          :returned-fields
          [{:column "a",
            :alias "b",
            :type :single-column,
            :source-columns [[{:type :all-columns, :table {:table-alias "p", :table "products"}}]]}
           {:column "c",
            :alias "d",
            :type :single-column,
            :source-columns [[{:type :all-columns, :table {:table-alias "p", :table "products"}}]]}]
          :errors #{}}
         (->references "select p.a as b, p.c as d from products p"))))

(deftest ^:parallel basic-nested-query-test
  (is (= {:used-fields
          #{{:column "b",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}
            {:column "a",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}},
          :returned-fields
          [{:column "a",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "products"}}]]}
           {:column "b",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "products"}}]]}]
          :errors #{}}
         (->references "select a, b from (select a, b from products)"))))

(deftest ^:parallel renamed-nested-query-test
  (is (= {:used-fields
          #{{:column "a",
             :alias "b",
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}
            {:column "a",
             :alias "c",
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}},
          :returned-fields
          [{:column "a",
            :alias "c",
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "products"}}]]}]
          :errors #{}}
         (->references "select b as c from (select a as b from products)"))))

(deftest ^:parallel broken-nested-query-test
  (is (= {:used-fields
          #{{:column "b",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}
            {:column "a",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:column "b",
                :alias nil,
                :type :single-column,
                :source-columns [[{:type :all-columns, :table {:table "products"}}]]}]]}},
          :returned-fields
          [{:column "a",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:column "b",
               :alias nil,
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:table "products"}}]]}]]}]
          :errors #{}}
         (->references "select a from (select b from products)"))))

(deftest ^:parallel different-case-nested-query-test
  (is (= {:used-fields
          #{{:column "a",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "orders"}}]]}},
          :returned-fields
          [{:column "a",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "orders"}}]]}]
          :errors #{}}
         (->references "select A from (select a from orders)"))))

(deftest ^:parallel wildcard-nested-query-test
  (is (= {:used-fields
          #{{:column "a",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "orders"}}]]}},
          :returned-fields
          [{:column "a",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "orders"}}]]}]
          :errors #{}}
         (->references "select * from (select a from orders)"))))

(deftest ^:parallel table-wildcard-nested-query-test
  (is (= {:used-fields
          #{{:column "a",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "orders"}}]]}},
          :returned-fields
          [{:column "a",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "orders"}}]]}]
          :errors #{}}
         (->references "select o.* from (select a from orders) o"))))

(deftest ^:parallel bad-table-wildcard-nested-query-test
  (is (= {:used-fields
          #{{:column "a",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "orders"}}]]}},
          :returned-fields []
          :errors #{(driver-api/missing-table-alias-error "foo")}}
         (->references "select foo.* from (select a from orders)"))))

(deftest ^:parallel bad-table-name-test
  (is (= {:used-fields
          #{{:column "a",
             :alias nil,
             :type :single-column,
             :source-columns []}},
          :returned-fields
          [{:column "a",
            :alias nil,
            :type :single-column,
            :source-columns []}]
          :errors #{(driver-api/missing-table-alias-error "bad")}}
         (->references "select bad.a from products"))))

(deftest ^:parallel no-possible-sources-test
  (is (= {:used-fields
          #{{:column "a"
             :alias nil
             :type :single-column
             :source-columns []}}
          :returned-fields
          [{:column "a"
            :alias nil
            :type :single-column
            :source-columns []}]
          :errors #{(driver-api/missing-column-error "a")}}
         (->references "select a"))))

(deftest ^:parallel select-constant-test
  (is (= {:used-fields #{},
          :returned-fields
          [{:alias nil, :type :custom-field, :used-fields #{}}],
          :errors #{}}
         (->references "select 1"))))

(deftest ^:parallel basic-where-test
  (is (= {:used-fields
          #{{:column "category",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}},
          :returned-fields [{:type :all-columns,
                             :table {:table "products"}}]
          :errors #{}}
         (->references "select * from products where category = 'hello'"))))

(deftest ^:parallel basic-aggregation-test
  (is (=? {:used-fields #{},
           :returned-fields [{:alias nil, :type :custom-field, :used-fields #{}}]
           :errors #{}}
          (->references "select count(*) from products"))))

(deftest ^:parallel named-aggregation-test
  (is (=? {:used-fields #{},
           :returned-fields [{:alias "count", :type :custom-field, :used-fields #{}}]
           :errors #{}}
          (->references "select count(*) as count from products"))))

(deftest ^:parallel extra-names-test
  (is (= {:used-fields
          #{{:column "col",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:database "db",
                        :schema "schema",
                        :table "table"}}]]}},
          :returned-fields
          [{:column "col",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:database "db",
                       :schema "schema",
                       :table "table"}}]]}]
          :errors #{}}
         (->references "select db.schema.table.col from db.schema.table"))))

(deftest ^:parallel basic-grouping-test
  (is (= {:used-fields
          #{{:column "category",
             :alias nil,
             :type :single-column,
             :source-columns [[{:alias "sum",
                                :type :custom-field,
                                :used-fields
                                #{{:column "total",
                                   :alias nil,
                                   :type :single-column,
                                   :source-columns [[{:type :all-columns, :table {:table "orders"}}]]}}}]
                              [{:type :all-columns,
                                :table {:table "orders"}}]]}
            {:column "total",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "orders"}}]]}},
          :returned-fields
          [{:alias "sum",
            :type :custom-field,
            :used-fields
            #{{:column "total",
               :alias nil,
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:table "orders"}}]]}}}]
          :errors #{}}
         (->references "select sum(total) as sum from orders group by category"))))

(deftest ^:parallel grouping-order-by-test
  (is (= {:used-fields
          #{{:alias "cards_created",
             :type :custom-field,
             :used-fields
             #{{:column "creator_id",
                :alias nil,
                :type :single-column,
                :source-columns [[{:type :all-columns, :table {:table "report_card"}}]]}}}
            {:column "creator_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "report_card"}}]]}
            {:column "creator_id",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:alias "cards_created",
                :type :custom-field,
                :used-fields
                #{{:column "creator_id",
                   :alias nil,
                   :type :single-column,
                   :source-columns [[{:type :all-columns, :table {:table "report_card"}}]]}}}]
              [{:type :all-columns, :table {:table "report_card"}}]]}},
          :returned-fields
          [{:column "creator_id",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns, :table {:table "report_card"}}]]}
           {:alias "cards_created",
            :type :custom-field,
            :used-fields
            #{{:column "creator_id",
               :alias nil,
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:table "report_card"}}]]}}}]
          :errors #{}}
         (->references "SELECT creator_id, COUNT(creator_id) AS cards_created FROM report_card GROUP BY creator_id ORDER BY cards_created DESC"))))

(deftest ^:parallel basic-arg-test
  (is (= {:used-fields
          #{{:column "category",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}},
          :returned-fields [{:type :all-columns,
                             :table {:table "products"}}]
          :errors #{}}
         (->references "select * from products where category = ?"))))

(deftest ^:parallel basic-case-test
  (is (=? {:used-fields
           #{{:column "tax",
              :alias nil,
              :type :single-column,
              :source-columns [[{:type :all-columns,
                                 :table {:table "orders"}}]]}
             {:column "total",
              :alias nil,
              :type :single-column,
              :source-columns [[{:type :all-columns,
                                 :table {:table "orders"}}]]}
             {:column "subtotal",
              :alias nil,
              :type :single-column,
              :source-columns [[{:type :all-columns,
                                 :table {:table "orders"}}]]}},
           :returned-fields
           [{:alias nil,
             :type :custom-field,
             :used-fields
             #{{:column "tax",
                :alias nil,
                :type :single-column,
                :source-columns [[{:type :all-columns,
                                   :table {:table "orders"}}]]}
               {:column "total",
                :alias nil,
                :type :single-column,
                :source-columns [[{:type :all-columns,
                                   :table {:table "orders"}}]]}
               {:column "subtotal",
                :alias nil,
                :type :single-column,
                :source-columns [[{:type :all-columns,
                                   :table {:table "orders"}}]]}}}]
           :errors #{}}
          (->references "select case when total < 0 then -subtotal else tax end from orders"))))

(deftest ^:parallel switch-case-test
  (is (=? {:used-fields
           #{{:column "category",
              :alias nil,
              :type :single-column,
              :source-columns [[{:type :all-columns,
                                 :table {:table "products"}}]]}},
           :returned-fields
           [{:alias nil,
             :type :custom-field,
             :used-fields
             #{{:column "category",
                :alias nil,
                :type :single-column,
                :source-columns [[{:type :all-columns,
                                   :table {:table "products"}}]]}}}]
           :errors #{}}
          (->references "select case category when 'Gizmo' then 'is gizmo' else 'is not gizmo' end from products"))))

(deftest ^:parallel basic-select-subquery-test
  (is (= {:used-fields
          #{{:column "product_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "orders"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}
            {:column "category",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]
                              [{:type :all-columns,
                                :table {:table "orders"}}]]}},
          :returned-fields
          [{:column "category",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "products"}}]
                             [{:type :all-columns,
                               :table {:table "orders"}}]]}
           {:type :all-columns, :table {:table "orders"}}]
          :errors #{}}
         (->references "select (select category from products where products.id = orders.product_id), * from orders"))))

(deftest ^:parallel named-select-subquery-test
  (is (= {:used-fields
          #{{:column "product_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "orders"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}
            {:column "category",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]
                              [{:type :all-columns,
                                :table {:table "orders"}}]]}},
          :returned-fields
          [{:column "category",
            :alias "category2",
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "products"}}]
                             [{:type :all-columns,
                               :table {:table "orders"}}]]}
           {:type :all-columns, :table {:table "orders"}}]
          :errors #{}}
         (->references "select (select category from products where products.id = orders.product_id) as category2, * from orders"))))

(deftest ^:parallel nested-select-subquery-test
  (is (= {:used-fields
          #{{:column "product_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "orders"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}
            {:column "category",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]
                              [{:type :all-columns,
                                :table {:table "orders"}}]]}},
          :returned-fields
          [{:column "category",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "products"}}]
                             [{:type :all-columns,
                               :table {:table "orders"}}]]}
           {:type :all-columns, :table {:table "orders"}}]
          :errors #{}}
         (->references "select (select (select category from products where products.id = orders.product_id)), * from orders"))))

(deftest ^:parallel select-subquery-with-normal-subquery-test
  (is (= {:used-fields
          #{{:column "product_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "orders"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}
            {:column "category",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]
                              [{:type :all-columns,
                                :table {:table "orders"}}]]}},
          :returned-fields
          [{:column "category",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "products"}}]
                             [{:type :all-columns,
                               :table {:table "orders"}}]]}
           {:type :all-columns, :table {:table "orders"}}]
          :errors #{}}
         (->references "select (select * from (select category from products where products.id = orders.product_id) sub), * from orders"))))

(deftest ^:parallel nested-select-subquery-with-reference-to-middle-select-test
  (is (= {:used-fields
          #{{:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "products"}}]]}
            {:column "product_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "orders"}}]]}
            {:column "category",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns, :table {:table "products"}}]
              [{:type :all-columns, :table {:table "orders"}}]]}},
          :returned-fields
          [{:column "category",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns, :table {:table "products"}}]
             [{:type :all-columns, :table {:table "orders"}}]]}]
          :errors #{}}
         (->references "select (select (select category) from products where products.id = orders.product_id) from orders"))))

(deftest ^:parallel nested-select-subquery-with-direct-match-in-outer-query
  (is (= {:used-fields
          #{{:column "a",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "t2"}}]]}
            {:column "a",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns, :table {:table "t1"}}]
              [{:column "a",
                :alias nil,
                :type :single-column,
                :source-columns [[{:type :all-columns, :table {:table "t2"}}]]}]]}},
          :returned-fields
          [{:column "a",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns, :table {:table "t1"}}]
             [{:column "a",
               :alias nil,
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:table "t2"}}]]}]]}]
          :errors #{}}
         (->references "select (select a from t1) from (select a from t2)"))))

(deftest ^:parallel basic-exists-test
  (is (= {:used-fields
          #{{:column "name",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table-alias "u", :table "users"}}]]}
            {:column "user_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table-alias "o", :table "orders"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table-alias "u", :table "users"}}]]}
            {:column "email",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table-alias "u", :table "users"}}]]}},
          :returned-fields
          [{:column "name",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table-alias "u", :table "users"}}]]}
           {:column "email",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table-alias "u", :table "users"}}]]}]
          :errors #{}}
         (->references "SELECT u.name, u.email
FROM users u
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)"))))

(deftest ^:parallel basic-not-test
  (is (= {:used-fields
          #{{:column "category",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}},
          :returned-fields [{:type :all-columns,
                             :table {:table "products"}}]
          :errors #{}}
         (->references "select * from products where not (category = 'Gizmo')"))))

(deftest ^:parallel basic-is-null-test
  (is (= {:used-fields
          #{{:column "category",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}},
          :returned-fields [{:type :all-columns,
                             :table {:table "products"}}]
          :errors #{}}
         (->references "select * from products where category is null"))))

(deftest ^:parallel negated-is-null-test
  (is (= {:used-fields
          #{{:column "category",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "products"}}]]}},
          :returned-fields [{:type :all-columns,
                             :table {:table "products"}}]
          :errors #{}}
         (->references "select * from products where category is not null"))))

(deftest ^:parallel basic-between-test
  (is (= {:used-fields
          #{{:column "created_at",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "orders"}}]]}
            {:column "left",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "orders"}}]]}
            {:column "right",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "orders"}}]]}},
          :returned-fields [{:type :all-columns, :table {:table "orders"}}]
          :errors #{}}
         (->references "select * from orders where created_at between left and right"))))

(deftest ^:parallel basic-select-table-alias-test
  (is (= {:used-fields #{},
          :returned-fields
          [{:type :custom-field,
            :alias "o",
            :used-fields #{{:type :all-columns, :table {:table "orders"}}}}]
          :errors #{}}
         (->references "select o from (select * from orders) as o"))))

(deftest ^:parallel select-table-alias-with-alias-test
  (is (= {:used-fields #{},
          :returned-fields
          [{:type :custom-field,
            :alias "o2",
            :used-fields #{{:type :all-columns, :table {:table "orders"}}}}]
          :errors #{}}
         (->references "select o as o2 from (select * from orders) as o"))))

(deftest ^:parallel table-function-test
  (is (= {:used-fields #{}, :returned-fields [{:type :unknown-columns}] :errors #{}}
         (->references "select i.* from generate_series(1, 500) as i"))))

(deftest ^:parallel basic-cte-test
  (is (= {:used-fields
          #{{:column "name",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "users"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "users"}}]]}
            {:column "active",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "users"}}]]}},
          :returned-fields
          [{:column "id",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "users"}}]]}
           {:column "name",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "users"}}]]}]
          :errors #{}}
         (->references "WITH active_users AS (SELECT id, name FROM users WHERE active = true)
SELECT * FROM active_users"))))

(deftest ^:parallel unused-cte-test
  (is (= {:used-fields
          #{{:column "name",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "users"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "users"}}]]}
            {:column "active",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "users"}}]]}},
          :returned-fields [{:type :all-columns,
                             :table {:table "products"}}]
          :errors #{}}
         (->references "WITH active_users AS (SELECT id, name FROM users WHERE active = true)
SELECT * FROM products"))))

(deftest ^:parallel dependent-cte-test
  (is (= {:used-fields
          #{{:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "orders"}}]]}},
          :returned-fields
          [{:column "id",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns, :table {:table "orders"}}]]}]
          :errors #{}}
         (->references "
WITH orders_a AS (select * from orders),
orders_b AS (select * from orders_a)
SELECT id from orders_b"))))

(deftest ^:parallel shadowed-cte-test
  (is (= {:used-fields
          #{{:column "y",
             :alias "x",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "a"}}]]}
            {:column "y",
             :alias "a",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "a"}}]]}
            {:column "z",
             :alias "y",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "a"}}]]}
            {:column "x",
             :alias "z",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "a"}}]]}
            {:column "z",
             :alias "b",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "a"}}]]}
            {:column "x",
             :alias "c",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "a"}}]]}},
          :returned-fields
          [{:column "y",
            :alias "a",
            :type :single-column,
            :source-columns [[{:type :all-columns, :table {:table "a"}}]]}
           {:column "z",
            :alias "b",
            :type :single-column,
            :source-columns [[{:type :all-columns, :table {:table "a"}}]]}
           {:column "x",
            :alias "c",
            :type :single-column,
            :source-columns [[{:type :all-columns, :table {:table "a"}}]]}]
          :errors #{}}
         (->references "WITH c AS (
    WITH b AS (
        SELECT
           x as z,
           y as x,
           z as y
        FROM a
    )
    SELECT
       x as a,
       y as b,
       z as c
    FROM b
)
SELECT
    a,
    b,
    c
FROM c;"))))

;; composite field here
(deftest ^:parallel recursive-cte-test
  (is (= {:used-fields
          #{{:column "id",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns, :table {:table-alias "h", :table "emp_hierarchy"}}]]}
            {:alias "name",
             :type :composite-field,
             :member-fields
             [{:column "name",
               :alias nil,
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:table "employees"}}]]}
              {:column "name",
               :alias nil,
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:table-alias "e",
                                                              :table "employees"}}]]}]}
            {:column "manager_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table-alias "e",
                                                            :table "employees"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table-alias "e",
                                                            :table "employees"}}]]}
            {:column "level",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table-alias "h",
                                                            :table "emp_hierarchy"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "employees"}}]]}
            {:column "name",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "employees"}}]]}
            {:column "name",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table-alias "e",
                                                            :table "employees"}}]]}
            {:alias "level",
             :type :composite-field,
             :member-fields
             [{:alias "level", :type :custom-field, :used-fields #{}}
              {:alias nil,
               :type :custom-field,
               :used-fields
               #{{:column "level",
                  :alias nil,
                  :type :single-column,
                  :source-columns
                  [[{:type :all-columns, :table {:table-alias "h",
                                                 :table "emp_hierarchy"}}]]}}}]}
            {:column "manager_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "employees"}}]]}
            {:column "manager_id",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:alias "level", :type :custom-field, :used-fields #{}}]
              [{:type :all-columns, :table {:table "employees"}}]]}},
          :returned-fields
          [{:alias "name",
            :type :composite-field,
            :member-fields
            [{:column "name",
              :alias nil,
              :type :single-column,
              :source-columns [[{:type :all-columns, :table {:table "employees"}}]]}
             {:column "name",
              :alias nil,
              :type :single-column,
              :source-columns
              [[{:type :all-columns, :table {:table-alias "e",
                                             :table "employees"}}]]}]}
           {:alias "level",
            :type :composite-field,
            :member-fields
            [{:alias "level", :type :custom-field, :used-fields #{}}
             {:alias nil,
              :type :custom-field,
              :used-fields
              #{{:column "level",
                 :alias nil,
                 :type :single-column,
                 :source-columns
                 [[{:type :all-columns, :table {:table-alias "h",
                                                :table "emp_hierarchy"}}]]}}}]}]
          :errors #{}}
         (->references "WITH RECURSIVE emp_hierarchy AS (
  SELECT id, name, manager_id, 0 AS level
  FROM employees
  WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, e.manager_id, h.level + 1
  FROM employees e
  JOIN emp_hierarchy h ON e.manager_id = h.id
)
SELECT name, level FROM emp_hierarchy"))))

(deftest ^:parallel basic-union-test
  (is (= {:used-fields
          #{{:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "archived_users"}}]]}
            {:column "name",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "users"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "users"}}]]}
            {:column "name",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "archived_users"}}]]}},
          :returned-fields
          [{:alias "id",
            :type :composite-field,
            :member-fields
            [{:column "id",
              :alias nil,
              :type :single-column,
              :source-columns [[{:type :all-columns,
                                 :table {:table "users"}}]]}
             {:column "id",
              :alias nil,
              :type :single-column,
              :source-columns [[{:type :all-columns,
                                 :table {:table "archived_users"}}]]}]}
           {:alias "name",
            :type :composite-field,
            :member-fields
            [{:column "name",
              :alias nil,
              :type :single-column,
              :source-columns [[{:type :all-columns,
                                 :table {:table "users"}}]]}
             {:column "name",
              :alias nil,
              :type :single-column,
              :source-columns [[{:type :all-columns,
                                 :table {:table "archived_users"}}]]}]}]
          :errors #{}}
         (->references "SELECT id, name FROM users
UNION
SELECT id, name FROM archived_users"))))

(deftest ^:parallel row-number-test
  (is (= {:used-fields
          #{{:column "salary",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "employees"}}]]}
            {:column "name",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns,
                                :table {:table "employees"}}]]}},
          :returned-fields
          [{:column "name",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns,
                               :table {:table "employees"}}]]}
           {:alias "rank",
            :type :custom-field,
            :used-fields
            #{{:column "salary",
               :alias nil,
               :type :single-column,
               :source-columns [[{:type :all-columns,
                                  :table {:table "employees"}}]]}}}]
          :errors #{}}
         (->references "SELECT name, ROW_NUMBER() OVER (ORDER BY salary DESC) AS rank
FROM employees"))))

(deftest ^:parallel partition-by-test
  (is (= {:used-fields
          #{{:column "salary",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "employees"}}]]}
            {:column "department",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "employees"}}]]}
            {:column "name",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:table "employees"}}]]}},
          :returned-fields
          [{:column "name",
            :alias nil,
            :type :single-column,
            :source-columns [[{:type :all-columns, :table {:table "employees"}}]]}
           {:alias "dept_rank",
            :type :custom-field,
            :used-fields
            #{{:column "salary",
               :alias nil,
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:table "employees"}}]]}
              {:column "department",
               :alias nil,
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:table "employees"}}]]}}}]
          :errors #{}}
         (->references "SELECT name,
  RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS dept_rank
FROM employees"))))

(deftest ^:parallel week-test
  (is (= {:used-fields
          #{{:column "created_at",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "orders"}}]]}},
          :returned-fields
          [{:alias "created_at",
            :type :custom-field,
            :used-fields
            #{{:column "created_at",
               :alias nil,
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:schema "public",
                                                              :table "orders"}}]]}}}
           {:alias "count", :type :custom-field, :used-fields #{}}]
          :errors #{}}
         (->references "SELECT
  (
    DATE_TRUNC(
      'week',
      (\"public\".\"orders\".\"created_at\" + INTERVAL '1 day')
    ) + INTERVAL '-1 day'
  ) AS \"created_at\",
  COUNT(*) AS \"count\"
FROM
  \"public\".\"orders\"
GROUP BY
  (
    DATE_TRUNC(
      'week',
      (\"public\".\"orders\".\"created_at\" + INTERVAL '1 day')
    ) + INTERVAL '-1 day'
  )
ORDER BY
  (
    DATE_TRUNC(
      'week',
      (\"public\".\"orders\".\"created_at\" + INTERVAL '1 day')
    ) + INTERVAL '-1 day'
  ) ASC"))))

(deftest ^:parallel week-of-year-test
  (is (= {:used-fields
          #{{:column "created_at",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "orders"}}]]}},
          :returned-fields
          [{:alias "created_at",
            :type :custom-field,
            :used-fields
            #{{:column "created_at",
               :alias nil,
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:schema "public",
                                                              :table "orders"}}]]}}}
           {:alias "count", :type :custom-field, :used-fields #{}}]
          :errors #{}}
         (->references "SELECT
  CEIL(
    (
      CAST(
        extract(
          doy
          from
            (
              DATE_TRUNC(
                'week',
                (\"public\".\"orders\".\"created_at\" + INTERVAL '1 day')
              ) + INTERVAL '-1 day'
            )
        ) AS integer
      ) / 7.0
    )
  ) AS \"created_at\",
  COUNT(*) AS \"count\"
FROM
  \"public\".\"orders\"
GROUP BY
  CEIL(
    (
      CAST(
        extract(
          doy
          from
            (
              DATE_TRUNC(
                'week',
                (\"public\".\"orders\".\"created_at\" + INTERVAL '1 day')
              ) + INTERVAL '-1 day'
            )
        ) AS integer
      ) / 7.0
    )
  )
ORDER BY
  CEIL(
    (
      CAST(
        extract(
          doy
          from
            (
              DATE_TRUNC(
                'week',
                (\"public\".\"orders\".\"created_at\" + INTERVAL '1 day')
              ) + INTERVAL '-1 day'
            )
        ) AS integer
      ) / 7.0
    )
  ) ASC"))))

;; This test is horrifically long and makes cam's eyes bleed because this checks that a complex query compiles to the
;; right ast.  Hopefully, other tests will catch any error caught by this test, but this is a bit of a failsafe.
^{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest ^:parallel complicated-test-1
  (is (= {:used-fields
          #{{:column "title",
             :alias "title",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "products"}}]]}
            {:column "discount",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "orders"}}]]}
            {:column "rating",
             :alias "rating",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "products"}}]]}
            {:alias "upper_category",
             :type :custom-field,
             :used-fields
             #{{:column "category",
                :alias "category",
                :type :single-column,
                :source-columns
                [[{:type :all-columns, :table {:schema "public",
                                               :table "products"}}]]}}}
            {:column "ean",
             :alias "ean",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "products"}}]]}
            {:column "created_at",
             :alias "created_at",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "products"}}]]}
            {:column "product_id",
             :alias "product_id",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "orders"}}]]}
            {:column "category",
             :alias "Products__category",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "products"}}]]}
            {:column "product_id",
             :alias nil,
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "orders"}}]]}
            {:column "category",
             :alias "category",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "products"}}]]}
            {:column "created_at",
             :alias "created_at",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "orders"}}]]}
            {:column "discount",
             :alias "discount",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "orders"}}]]}
            {:column "vendor",
             :alias "vendor",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "products"}}]]}
            {:column "total",
             :alias "total",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "orders"}}]]}
            {:column "id",
             :alias "Products__id",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "products"}}]]}
            {:column "id",
             :alias "id",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "products"}}]]}
            {:column "price",
             :alias "price",
             :type :single-column,
             :source-columns [[{:type :all-columns, :table {:schema "public",
                                                            :table "products"}}]]}},
          :returned-fields
          [{:alias "created_at",
            :type :custom-field,
            :used-fields
            #{{:column "created_at",
               :alias "created_at",
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:schema "public",
                                                              :table "orders"}}]]}}}
           {:alias "upper_category",
            :type :custom-field,
            :used-fields
            #{{:column "category",
               :alias "category",
               :type :single-column,
               :source-columns
               [[{:type :all-columns, :table {:schema "public",
                                              :table "products"}}]]}}}
           {:alias "sum",
            :type :custom-field,
            :used-fields
            #{{:column "total",
               :alias "total",
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:schema "public",
                                                              :table "orders"}}]]}}}
           {:alias "sum_2",
            :type :custom-field,
            :used-fields
            #{{:column "discount",
               :alias "discount",
               :type :single-column,
               :source-columns [[{:type :all-columns, :table {:schema "public",
                                                              :table "orders"}}]]}}}
           {:alias "count", :type :custom-field, :used-fields #{}}]
          :errors #{}}
         (->references "SELECT
  DATE_TRUNC('month', \"source\".\"created_at\") AS \"created_at\",
  \"source\".\"upper_category\" AS \"upper_category\",
  SUM(\"source\".\"total\") AS \"sum\",
  SUM(\"source\".\"discount\") AS \"sum_2\",
  COUNT(*) AS \"count\"
FROM
  (
    SELECT
      \"public\".\"orders\".\"product_id\" AS \"product_id\",
      \"public\".\"orders\".\"total\" AS \"total\",
      \"public\".\"orders\".\"discount\" AS \"discount\",
      \"public\".\"orders\".\"created_at\" AS \"created_at\",
      UPPER(\"Products\".\"category\") AS \"upper_category\",
      \"Products\".\"id\" AS \"Products__id\",
      \"Products\".\"category\" AS \"Products__category\"
    FROM
      \"public\".\"orders\"

LEFT JOIN (
        SELECT
          \"public\".\"products\".\"id\" AS \"id\",
          \"public\".\"products\".\"ean\" AS \"ean\",
          \"public\".\"products\".\"title\" AS \"title\",
          \"public\".\"products\".\"category\" AS \"category\",
          \"public\".\"products\".\"vendor\" AS \"vendor\",
          \"public\".\"products\".\"price\" AS \"price\",
          \"public\".\"products\".\"rating\" AS \"rating\",
          \"public\".\"products\".\"created_at\" AS \"created_at\"
        FROM
          \"public\".\"products\"
      ) AS \"Products\" ON \"public\".\"orders\".\"product_id\" = \"Products\".\"id\"

WHERE
      \"public\".\"orders\".\"discount\" > 0
  ) AS \"source\"
GROUP BY
  DATE_TRUNC('month', \"source\".\"created_at\"),
  \"source\".\"upper_category\"
ORDER BY
  DATE_TRUNC('month', \"source\".\"created_at\") ASC,
  \"source\".\"upper_category\" ASC"))))

;; This test is horrifically long and makes cam's eyes bleed because this checks that a complex query compiles to the
;; right ast.  Hopefully, other tests will catch any error caught by this test, but this is a bit of a failsafe.
^{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest ^:parallel complicated-test-2
  (is (= {:used-fields
          #{{:column "created_at",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:column "is_converted",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:column "annual_value",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:column "base_fee",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:column "subscription_status",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:column "id",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:column "account_id",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
            {:column "plan_alias",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:alias "is_paid_accounts_enterprise",
             :type :custom-field,
             :used-fields
             #{{:column "trial_ended_at",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "plan_name",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "lifetime_value",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "plan_name",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
               {:alias "month",
                :type :custom-field,
                :used-fields #{}}}}
            {:alias "is_active_accounts_starter",
             :type :custom-field,
             :used-fields
             #{{:column "plan_name",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "subscription_status",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
               {:column "plan_name",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}}}
            {:alias "is_active_accounts_enterprise",
             :type :custom-field,
             :used-fields
             #{{:column "plan_name",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "subscription_status",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
               {:column "plan_name",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}}}
            {:column "trial_ended_at",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:alias "is_paid_accounts_pro",
             :type :custom-field,
             :used-fields
             #{{:column "trial_ended_at",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "plan_name",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "lifetime_value",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "plan_name",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
               {:alias "month",
                :type :custom-field,
                :used-fields #{}}}}
            {:alias "is_trialing_accounts_cloud",
             :type :custom-field,
             :used-fields
             #{{:column "trial_ended_at",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "deployment",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "subscription_status",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
               {:alias "month",
                :type :custom-field,
                :used-fields #{}}}}
            {:column "deployment",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:column "plan_name",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:column "lifetime_value",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:column "subscription_status",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
            {:alias "is_active_accounts_pro",
             :type :custom-field,
             :used-fields
             #{{:column "plan_name",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "subscription_status",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
               {:column "plan_name",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}}}
            {:column "plan_name",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
            {:alias "is_active_accounts_self_hosted",
             :type :custom-field,
             :used-fields
             #{{:column "deployment",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "subscription_status",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}}}
            {:alias "is_active_accounts_cloud",
             :type :custom-field,
             :used-fields
             #{{:column "deployment",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "subscription_status",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}}}
            {:alias "is_trialing_accounts_self_hosted",
             :type :custom-field,
             :used-fields
             #{{:column "trial_ended_at",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "deployment",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "subscription_status",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
               {:alias "month",
                :type :custom-field,
                :used-fields #{}}}}
            {:column "customer_name",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:alias "is_trialing",
             :type :custom-field,
             :used-fields
             #{{:column "trial_ended_at",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "subscription_status",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
               {:alias "month",
                :type :custom-field,
                :used-fields #{}}}}
            {:column "is_active",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
            {:alias "is_paid_accounts_self_hosted",
             :type :custom-field,
             :used-fields
             #{{:column "trial_ended_at",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "deployment",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "lifetime_value",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:alias "month",
                :type :custom-field,
                :used-fields #{}}}}
            {:alias "is_paid_accounts_cloud",
             :type :custom-field,
             :used-fields
             #{{:column "trial_ended_at",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "deployment",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "lifetime_value",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:alias "month",
                :type :custom-field,
                :used-fields #{}}}}
            {:alias "is_paid_accounts_starter",
             :type :custom-field,
             :used-fields
             #{{:column "trial_ended_at",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "plan_name",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "lifetime_value",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
               {:column "plan_name",
                :alias nil,
                :type :single-column,
                :source-columns
                [[{:type :all-columns,
                   :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
               {:alias "month",
                :type :custom-field,
                :used-fields #{}}}}
            {:alias "month",
             :type :custom-field,
             :used-fields #{}}
            {:column "valid_to",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table
                {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
            {:column "valid_from",
             :alias nil,
             :type :single-column,
             :source-columns
             [[{:type :all-columns,
                :table
                {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}},
          :returned-fields
          [{:column "id",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
           {:column "customer_name",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
           {:column "created_at",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
           {:column "is_converted",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
           {:column "lifetime_value",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
           {:column "is_active",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
           {:column "subscription_status",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
           {:column "deployment",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
           {:column "plan_name",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
           {:column "plan_alias",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
           {:column "base_fee",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
           {:column "annual_value",
            :alias nil,
            :type :single-column,
            :source-columns
            [[{:type :all-columns,
               :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
           {:alias "month",
            :type :custom-field,
            :used-fields #{}}
           {:alias "is_trialing",
            :type :custom-field,
            :used-fields
            #{{:column "trial_ended_at",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "subscription_status",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
              {:alias "month",
               :type :custom-field,
               :used-fields #{}}}}
           {:alias "is_trialing_accounts_cloud",
            :type :custom-field,
            :used-fields
            #{{:column "trial_ended_at",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "deployment",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "subscription_status",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
              {:alias "month",
               :type :custom-field,
               :used-fields #{}}}}
           {:alias "is_active_accounts_cloud",
            :type :custom-field,
            :used-fields
            #{{:column "deployment",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "subscription_status",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}}}
           {:alias "is_paid_accounts_cloud",
            :type :custom-field,
            :used-fields
            #{{:column "trial_ended_at",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "deployment",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "lifetime_value",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:alias "month",
               :type :custom-field,
               :used-fields #{}}}}
           {:alias "is_trialing_accounts_self_hosted",
            :type :custom-field,
            :used-fields
            #{{:column "trial_ended_at",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "deployment",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "subscription_status",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
              {:alias "month",
               :type :custom-field,
               :used-fields #{}}}}
           {:alias "is_active_accounts_self_hosted",
            :type :custom-field,
            :used-fields
            #{{:column "deployment",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "subscription_status",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}}}
           {:alias "is_paid_accounts_self_hosted",
            :type :custom-field,
            :used-fields
            #{{:column "trial_ended_at",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "deployment",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "lifetime_value",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:alias "month",
               :type :custom-field,
               :used-fields #{}}}}
           {:alias "is_active_accounts_enterprise",
            :type :custom-field,
            :used-fields
            #{{:column "plan_name",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "subscription_status",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
              {:column "plan_name",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}}}
           {:alias "is_paid_accounts_enterprise",
            :type :custom-field,
            :used-fields
            #{{:column "trial_ended_at",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "plan_name",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "lifetime_value",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "plan_name",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
              {:alias "month",
               :type :custom-field,
               :used-fields #{}}}}
           {:alias "is_active_accounts_starter",
            :type :custom-field,
            :used-fields
            #{{:column "plan_name",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "subscription_status",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
              {:column "plan_name",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}}}
           {:alias "is_paid_accounts_starter",
            :type :custom-field,
            :used-fields
            #{{:column "trial_ended_at",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "plan_name",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "lifetime_value",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "plan_name",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
              {:alias "month",
               :type :custom-field,
               :used-fields #{}}}}
           {:alias "is_active_accounts_pro",
            :type :custom-field,
            :used-fields
            #{{:column "plan_name",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "subscription_status",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
              {:column "plan_name",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}}}
           {:alias "is_paid_accounts_pro",
            :type :custom-field,
            :used-fields
            #{{:column "trial_ended_at",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "plan_name",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "lifetime_value",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "a", :schema "dbt_models", :table "account"}}]]}
              {:column "plan_name",
               :alias nil,
               :type :single-column,
               :source-columns
               [[{:type :all-columns,
                  :table {:table-alias "ah", :schema "dbt_models", :table "account_history"}}]]}
              {:alias "month",
               :type :custom-field,
               :used-fields #{}}}}]
          :errors #{}}
         (->references "with months as (
  select
    generate_series(date_trunc('month', '2024-01-01'::date),
                    date_trunc('month', current_date) - interval '1 month',
                    '1 month')::date as month

)
, monthly_account_subscription_status as (
  select
    a.id,
    m.month,

    max(case when ah.subscription_status is not null and m.month <= date_trunc('month', a.trial_ended_at) then 1 else 0 end) as is_trialing,

    -- cloud
    max(case when ah.subscription_status is not null and a.deployment = 'cloud' and m.month <= date_trunc('month', a.trial_ended_at) then 1 else 0 end) as is_trialing_accounts_cloud,
    max(case when ah.subscription_status is not null and a.deployment = 'cloud' then 1 else 0 end) as is_active_accounts_cloud,
    max(case when a.lifetime_value > 0 and a.deployment = 'cloud' and (m.month >= date_trunc('month', a.trial_ended_at) or a.trial_ended_at is null) then 1 else 0 end) as is_paid_accounts_cloud,

    -- self-hosted
    max(case when ah.subscription_status is not null and a.deployment = 'self-hosted' and m.month <= date_trunc('month', a.trial_ended_at) then 1 else 0 end) as is_trialing_accounts_self_hosted,
    max(case when ah.subscription_status is not null and a.deployment = 'self-hosted' then 1 else 0 end) as is_active_accounts_self_hosted,
    max(case when a.lifetime_value > 0 and a.deployment = 'self-hosted' and (m.month >= date_trunc('month', a.trial_ended_at) or a.trial_ended_at is null) then 1 else 0 end) as is_paid_accounts_self_hosted,

    -- enterprise
    max(case when ah.subscription_status is not null and coalesce(ah.plan_name, a.plan_name) = 'enterprise' then 1 else 0 end) as is_active_accounts_enterprise,
    max(case when a.lifetime_value > 0 and coalesce(ah.plan_name, a.plan_name) = 'enterprise' and (m.month >= date_trunc('month', a.trial_ended_at) or a.trial_ended_at is null) then 1 else 0 end) as is_paid_accounts_enterprise,

    -- starter
    max(case when ah.subscription_status is not null and coalesce(ah.plan_name, a.plan_name) = 'starter' then 1 else 0 end) as is_active_accounts_starter,
    max(case when a.lifetime_value > 0 and coalesce(ah.plan_name, a.plan_name) = 'starter' and (m.month >= date_trunc('month', a.trial_ended_at) or a.trial_ended_at is null) then 1 else 0 end) as is_paid_accounts_starter,

    -- pro
    max(case when ah.subscription_status is not null and coalesce(ah.plan_name, a.plan_name) = 'pro' then 1 else 0 end) as is_active_accounts_pro,
    max(case when a.lifetime_value > 0 and coalesce(ah.plan_name, a.plan_name) = 'pro' and (m.month >= date_trunc('month', a.trial_ended_at) or a.trial_ended_at is null) then 1 else 0 end) as is_paid_accounts_pro
  from dbt_models.account a
  left join dbt_models.account_history ah
    on a.id = ah.account_id
  left join months m
    on m.month between date_trunc('month', ah.valid_from) and date_trunc('month', ah.valid_to)
  group by 1,2
)
select
  a.id,
  a.customer_name,
  a.created_at,
  a.is_converted,
  a.lifetime_value,
  a.is_active,
  a.subscription_status,
  a.deployment,
  a.plan_name,
  a.plan_alias,
  a.base_fee,
  a.annual_value,

  -- monthly account status
  mas.month,
  mas.is_trialing,
  mas.is_trialing_accounts_cloud,
  mas.is_active_accounts_cloud,
  mas.is_paid_accounts_cloud,
  mas.is_trialing_accounts_self_hosted,
  mas.is_active_accounts_self_hosted,
  mas.is_paid_accounts_self_hosted,
  mas.is_active_accounts_enterprise,
  mas.is_paid_accounts_enterprise,
  mas.is_active_accounts_starter,
  mas.is_paid_accounts_starter,
  mas.is_active_accounts_pro,
  mas.is_paid_accounts_pro

from dbt_models.account a
left join monthly_account_subscription_status mas
  on a.id = mas.id
;"))))
