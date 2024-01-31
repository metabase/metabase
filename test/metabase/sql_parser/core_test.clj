(ns metabase.sql-parser.core-test
  (:require [clojure.test :refer :all]
            [metabase.sql-parser.core :as sp]))

(def tables (comp sp/query->tables sp/parsed-query))

(deftest query->tables-test
  (testing "Simple queries"
    (is (= ["core_user"]
           (tables "select * from core_user;")))
    (is (= ["core_user"]
           (tables "select id, email from core_user;"))))
  (testing "With a schema (Postgres)" ;; TODO: only run this against supported DBs
    (is (= ["the_schema_name.core_user"]
           (tables "select * from the_schema_name.core_user;"))))
  (testing "Sub-selects"
    (is (= ["core_user"]
           (tables "select * from (select distinct email from core_user) q;")))))
