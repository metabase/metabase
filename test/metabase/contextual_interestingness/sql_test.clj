(ns metabase.contextual-interestingness.sql-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.contextual-interestingness.sql :as contextual-sql]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest dataset-query->sql-nil-test
  (testing "nil input → nil"
    (is (nil? (contextual-sql/dataset-query->sql nil)))))

(deftest dataset-query->sql-native-test
  (testing "Native queries pass their SQL through verbatim"
    (let [q {:database (mt/id)
             :type     :native
             :native   {:query "SELECT 1"}}]
      (is (= "SELECT 1" (contextual-sql/dataset-query->sql q))))))

(deftest dataset-query->sql-mbql-test
  (testing "MBQL queries compile to a SQL string mentioning the source table and aggregation"
    (mt/dataset test-data
      (let [sql (contextual-sql/dataset-query->sql
                 (mt/mbql-query venues {:aggregation [[:count]]
                                        :breakout    [$category_id]}))]
        (is (string? sql))
        (is (str/includes? (u/lower-case-en sql) "venues"))
        (is (str/includes? (u/lower-case-en sql) "count"))))))

(deftest dataset-query->sql-malformed-returns-nil-test
  (testing "A dataset_query that can't be compiled returns nil rather than throwing"
    ;; bogus database id forces driver resolution to fail
    (is (nil? (contextual-sql/dataset-query->sql
               {:database 999999 :type :query :query {:source-table 1 :aggregation [[:count]]}})))))

(deftest dataset-query->sql-truncation-test
  (testing "Output is bounded by max-sql-chars; oversized inputs gain a truncation marker"
    (let [native-long {:database (mt/id)
                       :type     :native
                       :native   {:query (apply str "SELECT " (repeat 5000 "x"))}}
          out         (contextual-sql/dataset-query->sql native-long)]
      (is (string? out))
      (is (<= (count out) (+ @#'contextual-sql/max-sql-chars 80))
          "Output stays within the cap plus the truncation marker")
      (is (str/includes? out "(truncated)")))))
