(ns metabase.driver.motherduck-test
  "SQL compilation and connection tests for the MotherDuck driver."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [are deftest is testing]]
   ;; Register the driver before testing its methods.
   [metabase.driver.motherduck]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.honey-sql-2 :as h2x]))

;; Check DuckDB JSON extraction syntax without a database connection.
(deftest ^:parallel json-query-test
  (let [identifier (h2x/identifier :field "boop" "bleh -> meh")]
    (testing "a nested field reference compiles to json_extract_string with an inlined JSON Pointer"
      (are [field expected] (= [expected]
                               (sql.qp/format-honeysql :motherduck (sql.qp/json-query :motherduck identifier field)))
        {:nfc-path [:bleh :meh] :database-type "text"}
        "CAST(JSON_EXTRACT_STRING(\"boop\".\"bleh\", '/meh') AS text)"

        ;; Avoid DuckDB's default DECIMAL(18,3) scale for JSON numbers.
        {:nfc-path [:bleh :meh] :database-type "decimal"}
        "CAST(JSON_EXTRACT_STRING(\"boop\".\"bleh\", '/meh') AS double)"

        {:nfc-path [:bleh "boop" :foobar 1234] :database-type "boolean"}
        "CAST(JSON_EXTRACT_STRING(\"boop\".\"bleh\", '/boop/foobar/1234') AS boolean)"

        {:nfc-path [:bleh "meh"] :database-type "timestamp"}
        "CAST(JSON_EXTRACT_STRING(\"boop\".\"bleh\", '/meh') AS timestamp)"))
    (testing "keys from the warehouse's JSON are escaped for JSON Pointer, and quotes are doubled for SQL"
      (are [k pointer] (= [(format "CAST(JSON_EXTRACT_STRING(\"boop\".\"bleh\", '%s') AS text)" pointer)]
                          (sql.qp/format-honeysql :motherduck
                                                  (sql.qp/json-query :motherduck identifier
                                                                     {:nfc-path ["bleh" k] :database-type "text"})))
        "a/b"      "/a~1b"
        "a~b"      "/a~0b"
        "~1"       "/~01"      ; escape ~ first, so a literal "~1" doesn't become "/"
        "a\"b"     "/a\"b"
        "a\\"      "/a\\"
        "it's"     "/it''s"
        "*"        "/*"))))

;; DuckDB's regexp_extract returns the whole match and '' on no match. regexExtract must return the first
;; capturing group, like Postgres substring(x FROM pattern), and NULL on no match.
(deftest ^:mb/driver-tests regex-match-first-semantics-test
  (mt/test-driver :motherduck
    (let [mp         (mt/metadata-provider)
          venue-name (lib.metadata/field mp (mt/id :venues :name))
          extract    (fn [pattern]
                       (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                       (lib/expression "extracted" (lib/regex-match-first venue-name pattern))
                                       (lib/filter (lib/= venue-name "Red Medicine")))]
                         (->> (lib/with-fields query [(lib/expression-ref query "extracted")])
                              qp/process-query
                              mt/rows)))]
      (are [pattern expected] (= [[expected]] (extract pattern))
        "^Red (\\w+)$"     "Medicine"     ; capturing group, not the whole match
        "^Red \\w+$"       "Red Medicine" ; no group: the whole match
        "^(?:Red) (\\w+)$" "Medicine"     ; non-capturing groups don't count
        "(?P<w>Med\\w+)"   "Medicine"     ; RE2 named group
        "^Blue"            nil))))        ; no match: NULL, not ''

(deftest connection-spec-forces-sslmode-require-test
  (testing "the :motherduck connection spec forces sslmode=require"
    (is (=? {:sslmode     "require"
             :classname   "org.postgresql.Driver"
             :subprotocol "postgresql"}
            (sql-jdbc.conn/connection-details->spec
             :motherduck
             {:host     "pg.us-east-1-aws.motherduck.com"
              :port     5432
              :dbname   "my_db"
              :user     "metabase"
              :password "placeholder"
              :ssl      true})))))

(deftest ^:mb/driver-tests live-connection-test
  (mt/test-driver :motherduck
    (testing "can open an SSL connection to the live MotherDuck pg endpoint and query it"
      ;; The same details the test data loader uses; this throws if MB_MOTHERDUCK_TEST_TOKEN is not set.
      (let [details (tx/dbdef->connection-details :motherduck :server nil)
            spec    (sql-jdbc.conn/connection-details->spec :motherduck details)]
        (testing "SELECT 1 succeeds (proves the TLS handshake + auth completed)"
          (is (= [{:one 1}]
                 (jdbc/query spec ["SELECT 1 AS one"]))))
        (testing "current_database() matches the requested dbname"
          (is (= [{:db (:dbname details)}]
                 (jdbc/query spec ["SELECT current_database() AS db"]))))))))
