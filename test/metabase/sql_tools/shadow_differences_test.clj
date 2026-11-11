(ns metabase.sql-tools.shadow-differences-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.sql-tools.shadow-differences :as shadow-differences]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- difference
  [sql & {:as overrides}]
  (merge {:method          :referenced-tables
          :dialect         "postgres"
          :outcome         :mismatch
          :primary-backend :sqlglot
          :shadow-backend  :sqlglot-java
          :sql             sql
          :args            []
          :primary         {:value [[nil nil "a"]]}
          :shadow          {:value [[nil nil "b"]]}}
         overrides))

(defn- rows []
  (t2/select [:model/SqlParsingShadowDifference :method :dialect :outcome :primary_backend :shadow_backend :sql
              :arguments :primary_result :shadow_result :seen_count]
             {:order-by [[:id :asc]]}))

(deftest record-test
  (mt/with-empty-h2-app-db!
    (testing "a difference is kept with its input and both results"
      (shadow-differences/record! (difference "SELECT * FROM a"))
      (shadow-differences/record! (difference "SELECT 1" :method :add-into-clause, :args ["t"]
                                              :outcome :shadow-only-error
                                              :primary {:value "SELECT 1"}
                                              :shadow {:error "ParseError", :message "Invalid expression"}))
      (is (= [{:method          "referenced-tables"
               :dialect         "postgres"
               :outcome         "mismatch"
               :primary_backend "sqlglot"
               :shadow_backend  "sqlglot-java"
               :sql             "SELECT * FROM a"
               :arguments       nil
               :primary_result  {:value [[nil nil "a"]]}
               :shadow_result   {:value [[nil nil "b"]]}
               :seen_count      1}
              {:method          "add-into-clause"
               :dialect         "postgres"
               :outcome         "shadow-only-error"
               :primary_backend "sqlglot"
               :shadow_backend  "sqlglot-java"
               :sql             "SELECT 1"
               :arguments       ["t"]
               :primary_result  {:value "SELECT 1"}
               :shadow_result   {:error "ParseError", :message "Invalid expression"}
               :seen_count      1}]
             (map #(-> (into {} %)
                       (update :arguments (fn [s] (some-> s json/decode)))
                       (update :primary_result json/decode+kw)
                       (update :shadow_result json/decode+kw))
                  (rows)))))
    (testing "the same input again counts one more time, and keeps the newest results"
      (shadow-differences/record! (difference "SELECT * FROM a" :shadow {:value [[nil nil "c"]]}))
      (is (= [2 {:value [[nil nil "c"]]}]
             (let [{:keys [seen_count shadow_result]} (first (rows))]
               [seen_count (json/decode+kw shadow_result)])))
      (is (= 2 (count (rows)))))))

(deftest record-keeps-at-most-max-rows-test
  (mt/with-empty-h2-app-db!
    (with-redefs [shadow-differences/max-rows 3]
      (doseq [i (range 5)]
        (shadow-differences/record! (difference (str "SELECT " i))))
      (is (= ["SELECT 2" "SELECT 3" "SELECT 4"]
             (map :sql (rows)))))))

(deftest record-truncates-sql-test
  (mt/with-empty-h2-app-db!
    (shadow-differences/record! (difference (apply str "SELECT " (repeat 100000 "x"))))
    (is (= 65536 (count (:sql (first (rows))))))))
