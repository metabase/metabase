(ns ^:mb/driver-tests metabase.driver.motherduck-sql-injection-test
  "Adversarial tests for SQL injection through the MotherDuck driver (QUE-978).

  Every value, identifier and alias below aims at one of the escapes Metabase relies on: doubled `'` in strings, doubled
  `\"` in identifiers, and backslashes left literal (the endpoint has `standard_conforming_strings` on). Several also try
  to stack a `DROP TABLE canary`. Each test checks its results, then that the canary is still there."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.util.honey-sql-2 :as h2x])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(def ^:private hostile-strings
  "A quote, a backslash before a quote, a double quote, a trailing backslash, a placeholder, comment closers and openers,
  a newline, dollar quoting, and the LIKE metacharacters."
  ["x'); DROP TABLE canary; --"
   "x\\'); DROP TABLE canary; --"
   "a\"b"
   "a\\"
   "q?"
   "*/ DROP TABLE canary; /*"
   "line1\n; DROP TABLE canary; --"
   "$$; DROP TABLE canary; $$"
   "100%"
   "a_b"])

(def ^:private hostile-name
  "A table and column name with every quoting-sensitive character except `;` and `,`, which HoneySQL rejects in entity
  names before they reach the database."
  "q'd\"b\\s?*/--")

(mt/defdataset sql-injection
  [["canary"
    [{:field-name "note", :base-type :type/Text}]
    [["still here"]]]
   ["hostile_values"
    [{:field-name "val", :base-type :type/Text}]
    (mapv vector hostile-strings)]
   [hostile-name
    [{:field-name hostile-name, :base-type :type/Text}]
    [["row 1"] ["row 2"]]]])

(defn- canary-intact? []
  (let [mp (mt/metadata-provider)]
    (= [["still here"]]
       (mt/rows (qp/process-query (-> (lib/query mp (lib.metadata/table mp (mt/id :canary)))
                                      (lib/with-fields [(lib.metadata/field mp (mt/id :canary :note))])))))))

(defn- rows-both-ways
  "Run `query` with parameters bound, and again as the SQL Metabase generates with them inlined. Return both row sets."
  [query]
  (let [inlined (qp.compile/compile-with-inline-parameters query)]
    {:params (mt/rows (qp/process-query query))
     :inline (mt/rows (qp/process-query (mt/native-query {:query (:query inlined)})))}))

(deftest hostile-values-test
  (mt/test-driver :motherduck
    (mt/dataset sql-injection
      (let [mp    (mt/metadata-provider)
            val   (lib.metadata/field mp (mt/id :hostile_values :val))
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :hostile_values)))
                      (lib/with-fields [val]))]
        (doseq [v hostile-strings]
          (testing (format "a filter value of %s matches only that row" (pr-str v))
            (is (= {:params [[v]] :inline [[v]]}
                   (rows-both-ways (lib/filter query (lib/= val v))))))
          (testing (format "a contains filter on %s treats every character literally" (pr-str v))
            (let [expected (->> hostile-strings (filter #(str/includes? % v)) sort (mapv vector))]
              (is (= {:params expected :inline expected}
                     (rows-both-ways (-> query
                                         (lib/filter (lib/contains val v))
                                         (lib/order-by val)))))))))
      (is (canary-intact?)))))

(deftest hostile-identifiers-test
  (mt/test-driver :motherduck
    (mt/dataset sql-injection
      (let [mp    (mt/metadata-provider)
            table (lib.metadata/table mp (mt/id hostile-name))
            field (lib.metadata/field mp (mt/id hostile-name hostile-name))]
        (testing "sync finds the table and column under their exact names"
          (is (= [hostile-name hostile-name] [(:name table) (:name field)])))
        (testing "queries on them select, filter and aggregate correctly"
          (is (= {:params [["row 2"]] :inline [["row 2"]]}
                 (rows-both-ways (-> (lib/query mp table)
                                     (lib/with-fields [field])
                                     (lib/filter (lib/= field "row 2"))))))
          (is (= {:params [["row 1" 1] ["row 2" 1]] :inline [["row 1" 1] ["row 2" 1]]}
                 (rows-both-ways (-> (lib/query mp table)
                                     (lib/aggregate (lib/count))
                                     (lib/breakout field)
                                     (lib/order-by field)))))))
      (is (canary-intact?)))))

(deftest hostile-aliases-test
  (mt/test-driver :motherduck
    (mt/dataset sql-injection
      (let [mp        (mt/metadata-provider)
            values    (lib.metadata/table mp (mt/id :hostile_values))
            canary    (lib.metadata/table mp (mt/id :canary))
            values-id (lib.metadata/field mp (mt/id :hostile_values :id))
            canary-id (lib.metadata/field mp (mt/id :canary :id))
            note      (lib.metadata/field mp (mt/id :canary :note))]
        (doseq [alias-name (cons hostile-name hostile-strings)]
          (testing (format "a custom column named %s" (pr-str alias-name))
            (let [query (as-> (lib/query mp values) q
                          (lib/expression q alias-name (lib/concat (lib.metadata/field mp (mt/id :hostile_values :val)) "!"))
                          (lib/with-fields q [(lib/expression-ref q alias-name)])
                          (lib/filter q (lib/= values-id 9)))]
              (is (= {:params [["100%!"]] :inline [["100%!"]]}
                     (rows-both-ways query)))))
          (testing (format "a join aliased %s" (pr-str alias-name))
            (let [query (-> (lib/query mp values)
                            (lib/join (-> (lib/join-clause canary [(lib/= values-id canary-id)])
                                          (lib/with-join-alias alias-name)
                                          (lib/with-join-fields [(lib/with-join-alias note alias-name)])))
                            (lib/with-fields [values-id])
                            (lib/filter (lib/= values-id 1)))]
              (is (= {:params [[1 "still here"]] :inline [[1 "still here"]]}
                     (rows-both-ways query)))))))
      (is (canary-intact?)))))

(def ^:private json-doc
  "A JSON document whose keys break JSONPath: quotes, backslashes, a key that spells a different nested path, and `*`.
  The decoy is what `x\".\"y` reads as a JSONPath."
  (str "{\"plain\": \"PLAIN\", \"a\\\"b\": \"QUOTE\", \"a\\\\\": \"BACKSLASH\", \"a/b\": \"SLASH\", \"a~b\": \"TILDE\","
       " \"~1\": \"TILDE-ONE\", \"x\": {\"y\": \"DECOY\"}, \"x\\\".\\\"y\": \"TRICKY\", \"it's\": \"APOS\", \"*\": \"STAR\","
       " \"x'); DROP TABLE canary; --\": \"PAYLOAD\"}"))

(defn- json-key-value
  "Read key `k` from [[json-doc]] with the driver's nested-field SQL, as sync-discovered nested fields would."
  [k]
  (let [extract (sql.qp/json-query :motherduck
                                   (h2x/identifier :field "t" "doc")
                                   {:nfc-path ["doc" k], :database-type "text"})
        [sql & params] (sql.qp/format-honeysql :motherduck
                                               {:select [[extract :v]]
                                                :from   [[{:select [[(h2x/cast "json" [:inline json-doc]) :doc]]} :t]]})]
    (ffirst (mt/rows (qp/process-query (mt/native-query {:query sql, :params params}))))))

(deftest json-key-test
  (mt/test-driver :motherduck
    (mt/dataset sql-injection
      (testing "nested JSON fields read exactly their own key"
        (doseq [[k expected] {"plain"                       "PLAIN"
                              "a\"b"                        "QUOTE"
                              "a\\"                         "BACKSLASH"
                              "a/b"                         "SLASH"
                              "a~b"                         "TILDE"
                              "~1"                          "TILDE-ONE"
                              "x\".\"y"                     "TRICKY"
                              "it's"                        "APOS"
                              "*"                           "STAR"
                              "x'); DROP TABLE canary; --"  "PAYLOAD"}]
          (is (= expected (json-key-value k))
              (format "key %s" (pr-str k)))))
      (is (canary-intact?)))))

(defn- execute-ddl! [db-id & statements]
  (sql-jdbc.execute/do-with-connection-with-options
   :motherduck db-id {:write? true}
   (fn [^Connection conn]
     (doseq [^String sql statements]
       (with-open [stmt (.createStatement conn)]
         ;; The endpoint returns result sets for DDL, which executeUpdate rejects.
         (.execute stmt sql))))))

(defn- table-exists? [db-id schema table]
  (sql-jdbc.execute/do-with-connection-with-options
   :motherduck db-id nil
   (fn [^Connection conn]
     (with-open [stmt (.prepareStatement conn (str "SELECT count(*) FROM duckdb_tables() WHERE database_name = current_database()"
                                                   " AND schema_name = CAST(? AS VARCHAR) AND table_name = CAST(? AS VARCHAR)"))]
       (.setString stmt 1 schema)
       (.setString stmt 2 table)
       (with-open [rs (.executeQuery stmt)]
         (.next rs)
         (pos? (.getLong rs 1)))))))

(deftest drop-table-schema-test
  (mt/test-driver :motherduck
    (mt/dataset sql-injection
      (testing "drop-table! drops the table in the named schema, even when HoneySQL would rewrite its dashes"
        (let [db-id (mt/id)]
          (try
            (execute-ddl! db-id
                          "CREATE SCHEMA IF NOT EXISTS \"sqli-dash\""
                          "CREATE SCHEMA IF NOT EXISTS \"sqli_dash\""
                          "CREATE TABLE IF NOT EXISTS \"sqli-dash\".\"t\" (x INTEGER)"
                          "CREATE TABLE IF NOT EXISTS \"sqli_dash\".\"t\" (x INTEGER)")
            (driver/drop-table! :motherduck db-id :sqli-dash/t)
            (is (false? (table-exists? db-id "sqli-dash" "t")))
            (is (true? (table-exists? db-id "sqli_dash" "t")))
            (finally
              (execute-ddl! db-id
                            "DROP SCHEMA IF EXISTS \"sqli-dash\" CASCADE"
                            "DROP SCHEMA IF EXISTS \"sqli_dash\" CASCADE")))))
      (is (canary-intact?)))))
