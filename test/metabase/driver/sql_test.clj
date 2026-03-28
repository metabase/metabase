(ns ^:mb/driver-tests metabase.driver.sql-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]))

(deftest ^:parallel is-single-select-stmt?-test
  (mt/test-drivers (mt/normal-drivers-with-feature :connection-impersonation)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))
          orders (lib.metadata/table mp (mt/id :orders))
          query (-> (lib/query mp products)
                    (lib/join (lib/join-clause orders [(lib/= (mt/id :products :id)
                                                              (mt/id :orders :product_id))])))
          native-query (:query (qp.compile/compile-with-inline-parameters query))]
      (testing "A single SELECT statement returns true and the reconstructed SQL"
        (are [sql] (=? {:is-single-select? true, :sql string?}
                       (#'driver.sql/is-single-select-stmt? sql))
          native-query
          "SELECT 1"
          "SELECT * FROM table"
          "WITH x AS (SELECT * FROM foo) SELECT * from x"
          "WITH x AS (SELECT a FROM foo), y AS (SELECT b FROM bar), z AS (SELECT c FROM baz) SELECT x.a, y.b, z.c FROM x, y, z")))
    (testing "All other queries are rejected"
      (are [sql] (=? {:is-single-select? false}
                     (#'driver.sql/is-single-select-stmt? sql))
        "SELECT ("
        "SELECT 1; SELECT 2"
        "SET ROLE NONE"
        "DROP TABLE table"
        "SET ROLE NONE; DROP TABLE table"
        "SELECT set_config('role', 'none', false); DROP TABLE table"
        "DO $$ BEGIN EXECUTE 'SET ROLE NONE; DROP TABLE table'; END $$;"))))
