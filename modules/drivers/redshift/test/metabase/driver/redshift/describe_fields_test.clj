(ns ^:mb/driver-tests metabase.driver.redshift.describe-fields-test
  "Side-by-side comparison of the outgoing `describe-fields` query against the current one.

  Redshift evaluates `information_schema` on the leader node and does not push the outer restriction through the
  LEFT JOIN into the `pk` derived table, so the outgoing query read every primary-key constraint in the cluster on
  every call, including when syncing a single table. [[outgoing-describe-fields-sql]] is a frozen copy of that query
  so both can be generated and run from one place: the pure tests show what changed in the SQL, and
  `equivalence-test` runs both against a real Redshift to show the narrower query still returns the same fields."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- outgoing-describe-fields-sql
  "`describe-fields-sql` for `:redshift` as it stood before the `pk` derived table was scoped. Frozen on purpose: it is
  the baseline the current query is measured against, so it must not be updated to track the production form."
  [& {:keys [schema-names table-names]}]
  (sql/format {:select [[:c.column_name :name]
                        [:c.data_type :database-type]
                        [[:- :c.ordinal_position [:inline 1]] :database-position]
                        [:c.table_schema :table-schema]
                        [:c.table_name :table-name]
                        [[:not= :pk.column_name nil] :pk?]
                        [[:case [:not= :c.remarks [:inline ""]] :c.remarks :else nil] :field-comment]]
               :from [[:svv_columns :c]]
               :left-join [[{:select [:tc.table_schema
                                      :tc.table_name
                                      :kc.column_name]
                             :from [[:information_schema.table_constraints :tc]]
                             :join [[:information_schema.key_column_usage :kc]
                                    [:and
                                     [:= :tc.constraint_name :kc.constraint_name]
                                     [:= :tc.table_schema :kc.table_schema]
                                     [:= :tc.table_name :kc.table_name]]]
                             :where [:= :tc.constraint_type [:inline "PRIMARY KEY"]]}
                            :pk]
                           [:and
                            [:= :c.table_schema :pk.table_schema]
                            [:= :c.table_name :pk.table_name]
                            [:= :c.column_name :pk.column_name]]]
               :where [:and
                       [:raw "c.table_schema !~ '^information_schema|catalog_history|pg_'"]
                       (when schema-names [:in :c.table_schema (map u/lower-case-en schema-names)])
                       (when table-names [:in :c.table_name (map u/lower-case-en table-names)])]
               :order-by [:table-schema :table-name :database-position]}
              :dialect (sql.qp/quote-style :redshift)))

(defn- pk-derived-table
  "The text of the `pk` derived table within a generated `describe-fields` statement."
  [[sql]]
  (subs sql
        (+ (str/index-of sql "LEFT JOIN (") (count "LEFT JOIN ("))
        (str/index-of sql ") AS \"pk\"")))

(deftest ^:parallel scoped-sync-restricts-pk-derived-table-test
  (let [args     {:schema-names ["My_Schema"] :table-names ["My_Table"]}
        outgoing (outgoing-describe-fields-sql args)
        current  (sql-jdbc.sync/describe-fields-sql :redshift args)]
    (testing "outgoing: only the outer scan was restricted, so the pk derived table read every constraint"
      (is (not (str/includes? (pk-derived-table outgoing) "IN (?)")))
      (is (= ["my_schema" "my_table"] (rest outgoing))))
    (testing "current: the pk derived table is restricted to the same schemas and tables as the outer scan"
      (is (str/includes? (pk-derived-table current) "\"tc\".\"table_schema\" IN (?)"))
      (is (str/includes? (pk-derived-table current) "\"tc\".\"table_name\" IN (?)"))
      (is (= ["my_schema" "my_table" "my_schema" "my_table"] (rest current))))))

(deftest ^:parallel unscoped-sync-is-unchanged-test
  (testing "a whole-database sync asked for no scope, so there is nothing to push down and the query is as it was"
    (let [outgoing (outgoing-describe-fields-sql)
          current  (sql-jdbc.sync/describe-fields-sql :redshift {})]
      (is (= (rest outgoing) (rest current)))
      ;; The generated text differs only in that a one-clause `:and` parenthesizes its clause.
      (is (= (first outgoing)
             (str/replace (first current)
                          "WHERE (\"tc\".\"constraint_type\" = 'PRIMARY KEY')"
                          "WHERE \"tc\".\"constraint_type\" = 'PRIMARY KEY'"))))))

(deftest equivalence-test
  (mt/test-driver :redshift
    (let [table    (t2/select-one :model/Table (mt/id :venues))
          spec     (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
          args     {:schema-names [(:schema table)] :table-names [(:name table)]}
          run      (fn [statement]
                     (let [timer (u/start-timer)
                           rows  (set (jdbc/query spec statement))]
                       {:rows rows :ms (u/since-ms timer)}))
          outgoing (run (outgoing-describe-fields-sql args))
          current  (run (sql-jdbc.sync/describe-fields-sql :redshift args))]
      (log/infof "describe-fields for %s.%s: outgoing %.0fms, current %.0fms"
                 (:schema table) (:name table) (:ms outgoing) (:ms current))
      (testing "restricting the pk derived table returns the same fields, primary keys included"
        (is (seq (:rows current)))
        (is (some :pk? (:rows current)))
        (is (= (:rows outgoing) (:rows current)))))))
