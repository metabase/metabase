(ns metabase-enterprise.legos.actions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.legos.actions :as legos.actions]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.yaml :as yaml]))

(deftest execute-transform-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "execute transform edn"
      (is (legos.actions/execute! {:lego "transform"
                                   :database (mt/id)
                                   :table "TARGET_TABLE"
                                   :query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"})))

    (testing "execute transform json"
      (is (legos.actions/execute!
           (json/decode (format "
{
  \"lego\": \"transform\",
  \"database\": %d,
  \"table\": \"TARGET_TABLE\",
  \"query\": \"SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'\"
}
" (mt/id))
                        keyword))))

    (testing "execute transform yaml"
      (is (legos.actions/execute!
           (yaml/parse-string
            (format "
lego: transform
database: %d
table: TARGET_TABLE
query: SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'
" (mt/id))))))))

(deftest execute-plan-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "executing a plan!"
      (is (legos.actions/execute-plan!
           (yaml/parse-string
            (format "
steps:
  - lego: transform
    database: %d
    table: TABLEA
    query: SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'
  - lego: transform
    database: %d
    table: TABLEB
    query: SELECT *, average(RATING) as AR FROM TABLE_A GROUP BY DATE_TRUNC('month', CREATED_AT)

" (mt/id) (mt/id))))))))
