(ns metabase.driver.motherduck-test
  "SQL compilation and connection tests for the MotherDuck driver.

  The live connection test reads its token through
  [[metabase.driver.motherduck-test.util/motherduck-token]] and skips when no token is available."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   ;; Register the driver before testing its methods.
   metabase.driver.motherduck
   [metabase.driver.motherduck-test.util :as motherduck-test.util]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util.honey-sql-2 :as h2x]))

(defn- test-details
  "Connection details for the live MotherDuck Postgres endpoint, with environment overrides.
  The endpoint authenticates with the token and ignores the user name."
  []
  {:host     (or (not-empty (System/getenv "MB_MOTHERDUCK_TEST_HOST")) "pg.us-east-1-aws.motherduck.com")
   :port     (Integer/parseInt (or (not-empty (System/getenv "MB_MOTHERDUCK_TEST_PORT")) "5432"))
   :dbname   (or (not-empty (System/getenv "MB_MOTHERDUCK_TEST_DB")) "my_db")
   :user     (or (not-empty (System/getenv "MB_MOTHERDUCK_TEST_USER")) "metabase")
   :password (motherduck-test.util/motherduck-token)
   :ssl      true})

;; Check DuckDB JSON extraction syntax without a database connection.
(deftest ^:parallel json-query-test
  (let [identifier (h2x/identifier :field "boop" "bleh -> meh")]
    (testing "a nested field reference compiles to json_extract_string with an inlined JSONPath"
      (are [field expected] (= [expected]
                               (sql.qp/format-honeysql :motherduck (sql.qp/json-query :motherduck identifier field)))
        {:nfc-path [:bleh :meh] :database-type "text"}
        "CAST(JSON_EXTRACT_STRING(\"boop\".\"bleh\", '$.\"meh\"') AS text)"

        ;; Avoid DuckDB's default DECIMAL(18,3) scale for JSON numbers.
        {:nfc-path [:bleh :meh] :database-type "decimal"}
        "CAST(JSON_EXTRACT_STRING(\"boop\".\"bleh\", '$.\"meh\"') AS double)"

        {:nfc-path [:bleh "boop" :foobar 1234] :database-type "boolean"}
        "CAST(JSON_EXTRACT_STRING(\"boop\".\"bleh\", '$.\"boop\".\"foobar\".\"1234\"') AS boolean)"

        {:nfc-path [:bleh "meh"] :database-type "timestamp"}
        "CAST(JSON_EXTRACT_STRING(\"boop\".\"bleh\", '$.\"meh\"') AS timestamp)"))))

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
    (let [spec (sql-jdbc.conn/connection-details->spec
                :motherduck
                (assoc (test-details) :password "placeholder"))]
      (is (= "require" (:sslmode spec)))
      (is (= "org.postgresql.Driver" (:classname spec)))
      (is (= "postgresql" (:subprotocol spec))))))

(deftest ^:mb/driver-tests live-connection-test
  (testing "can open an SSL connection to the live MotherDuck pg endpoint and query it"
    (if-not (motherduck-test.util/motherduck-token)
      (println "SKIP live-connection-test: no MOTHERDUCK_TOKEN in env or .env")
      (let [spec (sql-jdbc.conn/connection-details->spec :motherduck (test-details))]
        (testing "SELECT 1 succeeds (proves the TLS handshake + auth completed)"
          (is (= [{:one 1}]
                 (jdbc/query spec ["SELECT 1 AS one"]))))
        (testing "current_database() matches the requested dbname"
          (let [db (-> (jdbc/query spec ["SELECT current_database() AS db"]) first :db)]
            (println "connected to current_database() =" db)
            (is (= (:dbname (test-details)) db))))))))
