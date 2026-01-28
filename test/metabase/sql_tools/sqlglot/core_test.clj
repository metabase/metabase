(ns metabase.sql-tools.sqlglot.core-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.sql-tools.sqlglot.core :as sql-tools.sqlglot]
   [metabase.test :as mt]))

(deftest www-returned-columns-001-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select * from orders")]
      (is (=? {:base-type :type/Float,
               :effective-type :type/Float,
               :semantic-type nil,
               :database-type "float8",
               :lib/type :metadata/column,
               :lib/desired-column-alias "total",
               :name "total",
               :display-name "Total"}
              (try
                (first @(def ss (#'sql-tools.sqlglot/returned-columns driver/*driver* query)))
                (catch Throwable t
                  (def ttt t)
                  (throw t))))))))

(deftest schema-001-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select * from orders")]
      (is (=? {"public"
               {"orders"
                {"total" "UNKNOWN",
                 "product_id" "UNKNOWN",
                 "user_id" "UNKNOWN",
                 "discount" "UNKNOWN",
                 "id" "UNKNOWN",
                 "quantity" "UNKNOWN",
                 "subtotal" "UNKNOWN",
                 "created_at" "UNKNOWN",
                 "tax" "UNKNOWN"}}}
              @(def ss (#'sql-tools.sqlglot/sqlglot-schema :postgres query)))))))
