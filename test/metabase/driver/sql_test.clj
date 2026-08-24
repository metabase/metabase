(ns ^:mb/driver-tests metabase.driver.sql-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]))

(deftest ^:parallel is-single-stmt-of-type?-test
  (mt/test-drivers (mt/normal-drivers-with-feature :connection-impersonation)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))
          product-category (lib.metadata/field mp (mt/id :products :category))
          query (-> (lib/query mp products)
                    (lib/filter (lib/= product-category "Widget")))
          native-query (:query (qp.compile/compile-with-inline-parameters query))]
      (testing "A single SELECT statement returns true and the reconstructed SQL"
        (are [sql] (=? {:is-single-stmt? true, :sql string?}
                       (#'driver.sql/is-single-stmt-of-type? sql "read"))
          native-query
          "SELECT 1"
          "SELECT * FROM table"
          "WITH x AS (SELECT * FROM foo) SELECT * from x"
          "WITH x AS (SELECT a FROM foo), y AS (SELECT b FROM bar), z AS (SELECT c FROM baz) SELECT x.a, y.b, z.c FROM x, y, z")))
    (testing "All other queries are rejected"
      (are [sql] (=? {:is-single-stmt? false}
                     (#'driver.sql/is-single-stmt-of-type? sql "read"))
        "SELECT ("
        "SELECT 1; SELECT 2"
        "SET ROLE NONE"
        "DROP TABLE table"
        "SET ROLE NONE; DROP TABLE table"
        "SELECT set_config('role', 'none', false); DROP TABLE table"
        "DO $$ BEGIN EXECUTE 'SET ROLE NONE; DROP TABLE table'; END $$;"))))

(deftest ^:parallel split-compound-table-spec-test
  (are [spec expected] (= expected (#'driver.sql/split-compound-table-spec spec))
    {:table "t1" :schema nil}         {:table "t1" :schema nil}
    {:table "ds1.t1" :schema nil}     {:schema "ds1" :table "t1"}
    {:table "p1.ds1.t1" :schema nil}  {:schema "ds1" :table "t1"}
    ;; a name Macaw already split stays split, dots in it and all
    {:table "a.b" :schema "ds1"}      {:table "a.b" :schema "ds1"}
    {:table nil :schema nil}          {:table nil :schema nil}))
