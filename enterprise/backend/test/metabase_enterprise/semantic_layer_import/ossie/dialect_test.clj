(ns metabase-enterprise.semantic-layer-import.ossie.dialect-test
  "[[metabase-enterprise.semantic-layer-import.ossie.dialect]]: which of a document's dialects is read, and what that
  says about the warehouse."
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase-enterprise.semantic-layer-import.ossie.dialect :as dialect])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest ^:parallel normalize-test
  (are [written normalized] (= normalized (dialect/normalize written))
    "SNOWFLAKE"      "SNOWFLAKE"
    "snowflake"      "SNOWFLAKE"
    " Snowflake_SQL " "SNOWFLAKE"
    "ANSI_SQL"       "ANSI_SQL"
    "ossie_sql_2026" "OSSIE_SQL_2026"
    "MDX"            "MDX"))

(deftest ^:parallel choose-test
  (testing "the option wins: a vendor SQL dialect as itself, a portable one as the portable dialects"
    (is (= "SNOWFLAKE" (dialect/choose "snowflake" #{"ANSI_SQL" "BIGQUERY"})))
    (is (nil? (dialect/choose "ANSI_SQL" #{"SNOWFLAKE"})))
    (is (nil? (dialect/choose "OSSIE_SQL_2026" #{"SNOWFLAKE"}))))
  (testing "an option that is not SQL the import reads fails the run"
    (is (thrown-with-msg? ExceptionInfo #"The :dialect option \"MDX\" is not a SQL dialect the import reads"
                          (dialect/choose "MDX" #{"ANSI_SQL"}))))
  (testing "without the option, the one vendor SQL dialect the document uses, else the portable ones"
    (is (= "BIGQUERY" (dialect/choose nil #{"ANSI_SQL" "BIGQUERY"})))
    (is (= "BIGQUERY" (dialect/choose nil #{"ANSI_SQL" "BIGQUERY" "DAX" "TABLEAU"})))
    (is (nil? (dialect/choose nil #{"ANSI_SQL" "BIGQUERY" "SNOWFLAKE"})))
    (is (nil? (dialect/choose nil #{"ANSI_SQL"})))
    (is (nil? (dialect/choose nil #{"OSSIE_SQL_2026" "MDX"})))
    (is (nil? (dialect/choose nil #{})))))

(deftest ^:parallel warehouse-test
  (is (= {:type "SNOWFLAKE", :driver :snowflake} (dialect/warehouse "SNOWFLAKE")))
  (is (= {:type "TRINO", :driver :starburst} (dialect/warehouse "TRINO")))
  (is (= {:type "BIGQUERY", :driver :bigquery-cloud-sdk} (dialect/warehouse "BIGQUERY")))
  (is (= {:type nil, :driver nil} (dialect/warehouse nil)))
  (is (= "snowflake" (dialect/sqlglot-dialect "SNOWFLAKE")))
  (is (= "bigquery" (dialect/sqlglot-dialect "BIGQUERY")))
  (is (nil? (dialect/sqlglot-dialect nil))))

(deftest ^:parallel pick-test
  (let [expression {:sql      "ossie form"
                    :dialects [{:dialect "ANSI_SQL", :expression "ansi form"}
                               {:dialect "OSSIE_SQL_2026", :expression "ossie entry"}
                               {:dialect "snowflake", :expression "snowflake form"}
                               {:dialect "MDX", :expression "[Measures].[x]"}]}]
    (testing "the chosen dialect first"
      (is (= {:dialect "SNOWFLAKE", :expression "snowflake form"} (dialect/pick "SNOWFLAKE" expression))))
    (testing "then ANSI_SQL, then the top-level sql, which is the OSSIE_SQL_2026 form and wins over the entry"
      (is (= {:dialect "ANSI_SQL", :expression "ansi form"} (dialect/pick nil expression)))
      (is (= {:dialect "ANSI_SQL", :expression "ansi form"} (dialect/pick "BIGQUERY" expression)))
      (is (= {:dialect "OSSIE_SQL_2026", :expression "ossie form"}
             (dialect/pick nil (update expression :dialects rest))))
      (is (= {:dialect "OSSIE_SQL_2026", :expression "ossie entry"}
             (dialect/pick nil (-> expression (dissoc :sql) (update :dialects rest))))))
    (testing "nothing the import reads"
      (is (nil? (dialect/pick nil {:dialects [{:dialect "MDX", :expression "[Measures].[x]"}]})))
      (is (nil? (dialect/pick "SNOWFLAKE" {:dialects [{:dialect "BIGQUERY", :expression "x"}]}))))
    (testing "the first entry of a dialect written twice"
      (is (= {:dialect "ANSI_SQL", :expression "first"}
             (dialect/pick nil {:dialects [{:dialect "ANSI_SQL", :expression "first"}
                                           {:dialect "ansi_sql", :expression "second"}]}))))))

(deftest ^:parallel used-test
  (is (= #{"ANSI_SQL" "SNOWFLAKE" "OSSIE_SQL_2026"}
         (dialect/used [{:dialects [{:dialect "ANSI_SQL", :expression "a"} {:dialect "SNOWFLAKE", :expression "b"}]}
                        {:sql "c"}
                        {:dialects [{:dialect "ANSI_SQL", :expression "d"}]}]))))
