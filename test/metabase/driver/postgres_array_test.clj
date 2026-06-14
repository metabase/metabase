(ns metabase.driver.postgres-array-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.util.honey-sql-2 :as h2x]))

(deftest ^:parallel database-type->base-type-test
  (is (= :type/Array
         (sql-jdbc.sync.interface/database-type->base-type :postgres :_text)))
  (is (= :type/Array
         (sql-jdbc.sync.interface/database-type->base-type :postgres :_int4)))
  (is (= :type/Text
         (sql-jdbc.sync.interface/database-type->base-type :postgres :text))))

(deftest ^:parallel array-element-base-type-test
  (is (= :type/Text (driver/array-element-base-type :postgres "_text")))
  (is (= :type/Integer (driver/array-element-base-type :postgres "_int4"))))

(deftest ^:parallel array-unnest-from-test
  (let [table-hsql (h2x/identifier :table "venues")
        col-hsql   (h2x/identifier :field "tags")
        [table-entry unnest-from] (sql.qp/array-unnest-from :postgres table-hsql col-hsql)]
    (is (= [table-hsql] table-entry))
    (is (= [[:raw "UNNEST(tags) AS _elem"]] unnest-from))))

(deftest ^:parallel array-contains->honeysql-test
  (let [[sql & params]
        (sql.qp/format-honeysql :postgres
                                (sql.qp/->honeysql :postgres
                                                   [:array-contains
                                                    [:field "tags" {:base-type :type/Array
                                                                    driver-api/qp.add.source-table "venues"}]
                                                    "foo"]))]
    (is (re-find #"ANY\(venues\.tags\)" sql))
    (is (= ["foo"] params))))
