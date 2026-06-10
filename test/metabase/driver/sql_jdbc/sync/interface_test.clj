(ns metabase.driver.sql-jdbc.sync.interface-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]))

(deftest ^:parallel alter-table-columns-sql-test
  (testing "should generate properly quoted SQL for ALTER TABLE statements; don't interpret :%keywords as function calls"
    (is (= ["ALTER TABLE"
            "  \"%PUBLIC\".\"EXAMPLE_CSV_FILE_925D85BA_AA56_4D3A_9590_1D79C9E4CAC1_20260610183010\""
            "ALTER COLUMN"
            "  \"_mb_row_id\" BIGINT GENERATED ALWAYS AS IDENTITY,"
            "ALTER COLUMN"
            "  \"id\" BIGINT,"
            "ALTER COLUMN"
            "  \"%name\" VARCHAR"]
           (->> (#'sql-jdbc.sync.interface/alter-table-columns-sql
                 :sql-jdbc
                 "%PUBLIC.EXAMPLE_CSV_FILE_925D85BA_AA56_4D3A_9590_1D79C9E4CAC1_20260610183010"
                 (ordered-map/ordered-map
                  :_mb_row_id [:bigint :generated-always :as :identity]
                  :id         [:bigint]
                  :%name      [:varchar]))
                (driver/prettify-native-form :sql-jdbc)
                str/split-lines)))))
