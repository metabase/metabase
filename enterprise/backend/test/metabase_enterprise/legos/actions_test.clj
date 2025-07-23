(ns metabase-enterprise.legos.actions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.legos.actions :as legos.actions]
   [metabase.test :as mt]))

(deftest execute-transform-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "execute transform literal"
      (is (legos.actions/execute! {:lego "transform"
                                   :database (mt/id)
                                   :table "TARGET_TABLE"
                                   :query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"})))

    (testing "execute transform edn"
      (is (legos.actions/execute!
           (legos.actions/hippie-parse
            (format
             "
{:lego \"transform\",
 :database %d,
 :table \"TARGET_TABLE\",
 :query \"SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'\"
}"
             (mt/id))))))

    (testing "execute transform json"
      (is (legos.actions/execute!
           (legos.actions/hippie-parse (format "
{
  \"lego\": \"transform\",
  \"database\": %d,
  \"table\": \"TARGET_TABLE\",
  \"query\": \"SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'\"
}
" (mt/id))))))

    (testing "execute transform yaml"
      (is (legos.actions/execute!
           (legos.actions/hippie-parse
            (format "
lego: transform
database: %d
table: TARGET_TABLE
query: SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'
" (mt/id))))))))

(deftest execute-transfer-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "execute transfer literal"
      (is (legos.actions/execute! {:lego "transfer"
                                   :source_database (mt/id)
                                   :source_table "products"
                                   :destination_database 37
                                   :destination_table "PRODUCTS_COPY"
                                   :overwrite? true})))

    (testing "execute transfer edn"
      (is (legos.actions/execute!
           (legos.actions/hippie-parse
            (format "
{:lego \"transfer\",
 :source_database %d,
 :source_table \"products\",
 :destination_database 37,
 :destination_table \"PRODUCTS_COPY\",
 :overwrite? true}"
                    (mt/id))))))

    (testing "execute transfer json"
      (is (legos.actions/execute!
           (legos.actions/hippie-parse
            (format
             "
{
  \"lego\":\"transfer\",
  \"source_database\":%d,
  \"source_table\":\"products\",
  \"destination_database\":37,
  \"destination_table\":\"PRODUCTS_COPY\",
  \"overwrite?\":true
}"
             (mt/id))))))

    (testing "execute transfer yaml"
      (is (legos.actions/execute!
           (legos.actions/hippie-parse
            (format
             "
lego: transfer
source_database: %d
source_table: products
destination_database: 37
destination_table: PRODUCTS_COPY
overwrite?: true
"
             (mt/id))))))))

(deftest execute-plan-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "executing a plan!"
      (is (legos.actions/execute-plan!
           (legos.actions/hippie-parse
            (format "
steps:
  - lego: transform
    database: %d
    table: TABLE_A
    query: SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'
  - lego: transform
    database: %d
    table: TABLEB
    query: SELECT DATE_TRUNC('month', CREATED_AT) as month, avg(RATING) as AR FROM \"TABLE_A\" GROUP BY DATE_TRUNC('month', CREATED_AT)

" (mt/id) (mt/id))))))))
