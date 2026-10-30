(ns ^:mb/driver-tests metabase.driver.motherduck-test
  "SQL compilation and connection tests for the MotherDuck driver."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [are deftest is testing]]
   [metabase.driver :as driver]
   ;; Register the driver before testing its methods.
   [metabase.driver.motherduck]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.honey-sql-2 :as h2x])
  (:import
   (java.sql Connection ResultSet ResultSetMetaData SQLException Types)
   (java.time OffsetTime)))

(set! *warn-on-reflection* true)

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
(deftest regex-match-first-semantics-test
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
        "^(?P<first_word>\\w+) Medicine$" "Red" ; a name Java rejects
        "^Blue"            nil))))        ; no match: NULL, not ''

(defn- read-unparseable
  "Read `s` with the driver's reader for a column of `jdbc-type` and `type-name`, through stand-in JDBC objects. Like
  pgjdbc on the endpoint's text, the stand-in can't read the value as an object, so the reader falls back to the string."
  [jdbc-type type-name s]
  (let [rs     (reify ResultSet
                 (^String getString [_ ^int _i] s)
                 (^Object getObject [_ ^int _i]
                   (throw (SQLException. (str "Bad value: " s))))
                 (^Object getObject [_ ^int _i ^Class _class]
                   (throw (SQLException. (str "Bad value: " s)))))
        rsmeta (reify ResultSetMetaData
                 (getColumnType [_ _i] jdbc-type)
                 (getColumnTypeName [_ _i] type-name)
                 (getColumnLabel [_ _i] "t"))]
    ((sql-jdbc.execute/read-column-thunk :motherduck rs rsmeta (int 1)))))

(defn- read-timetz [s]
  (read-unparseable Types/TIME "timetz" s))

;; `timetz-values-test` in `postgres-test` reads the endpoint's format live; these are the other branches.
(deftest ^:parallel read-timetz-test
  (testing "NULL"
    (is (nil? (read-timetz nil))))
  (testing "a value in Postgres's format goes to the inherited reader, so a fixed endpoint keeps the offset"
    (is (= (OffsetTime/parse "12:34:56+05:00")
           (read-timetz "12:34:56+05"))))
  (testing "any other format fails, naming the value and the column, rather than guessing"
    (doseq [s ["0001-01-03 07:34:56Z" "0001-12-31 07:34:56Z" "0001-01-01 07:34:56+05" "07:34:56"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Cannot read the TIMETZ value .* in column t\. Cast the column to VARCHAR to read it\."
                            (read-timetz s))
          s))))

;; `float-special-values-test` in `postgres-test` reads the endpoint's infinities live; these are the other branches.
(deftest ^:parallel read-endpoint-infinities-test
  (testing "REAL infinities read as Floats, like Postgres"
    (is (= [Float "Infinity"] ((juxt class str) (read-unparseable Types/REAL "float4" "+Inf"))))
    (is (= [Float "-Infinity"] ((juxt class str) (read-unparseable Types/REAL "float4" "-Inf")))))
  (testing "a one-dimensional float array, with NULLs, reads as a vector of the element type"
    (is (= [Double/POSITIVE_INFINITY nil 1.5 Double/NEGATIVE_INFINITY]
           (read-unparseable Types/ARRAY "_float8" "{+Inf,NULL,1.5,-Inf}")))
    (is (= [Float Float]
           (map class (read-unparseable Types/ARRAY "_float4" "{+Inf,2.5}")))))
  (testing "anything else rethrows pgjdbc's error rather than guessing"
    (doseq [[jdbc-type type-name s] [[Types/DOUBLE "float8" "Inf"]
                                     [Types/REAL "float4" "+Infinity"]
                                     [Types/ARRAY "_float8" "{{+Inf,1},{2,3}}"]
                                     [Types/ARRAY "_float8" "{+Inf,abc}"]
                                     [Types/ARRAY "_int4" "{1,2}"]]]
      (is (thrown-with-msg? SQLException #"Bad value"
                            (read-unparseable jdbc-type type-name s))
          s))))

(deftest ^:parallel connection-spec-verifies-the-server-test
  (let [details {:host     "pg.us-east-1-aws.motherduck.com"
                 :port     5432
                 :dbname   "my_db"
                 :user     "metabase"
                 :password "placeholder"
                 :ssl      true}]
    (testing "the connection verifies the server's certificate and hostname against the JVM trust store"
      (is (=? {:sslmode     "verify-full"
               :sslfactory  "org.postgresql.ssl.DefaultJavaSSLFactory"
               :classname   "org.postgresql.Driver"
               :subprotocol "postgresql"}
              (sql-jdbc.conn/connection-details->spec :motherduck details))))
    (testing "through an SSH tunnel, where the host is localhost, it verifies only the certificate"
      (is (=? {:sslmode    "verify-ca"
               :sslfactory "org.postgresql.ssl.DefaultJavaSSLFactory"}
              (sql-jdbc.conn/connection-details->spec :motherduck (assoc details :tunnel-enabled true)))))))

(deftest live-connection-test
  (mt/test-driver :motherduck
    (testing "can open an SSL connection to the live MotherDuck pg endpoint and query it"
      ;; The same details the test data loader uses; this throws if MB_MOTHERDUCK_TEST_TOKEN is not set.
      (let [details (tx/dbdef->connection-details :motherduck :server nil)
            spec    (sql-jdbc.conn/connection-details->spec :motherduck details)]
        (testing "SELECT 1 succeeds (proves the TLS handshake + auth completed)"
          (is (= [{:one 1}]
                 (jdbc/query spec ["SELECT 1 AS one"]))))
        (testing "the server's certificate also passes the chain-only check used through an SSH tunnel"
          (is (= [{:one 1}]
                 (jdbc/query (sql-jdbc.conn/connection-details->spec :motherduck (assoc details :tunnel-enabled true))
                             ["SELECT 1 AS one"]))))
        (testing "current_database() matches the requested dbname"
          (is (= [{:db (:dbname details)}]
                 (jdbc/query spec ["SELECT current_database() AS db"]))))))))

(defn- with-pooled-connection [f]
  (sql-jdbc.execute/do-with-connection-with-options :motherduck (mt/id) nil f))

(defn- pooled-current-database []
  (with-pooled-connection
    (fn [^Connection conn]
      (with-open [stmt (.createStatement conn)
                  rs   (.executeQuery stmt "SELECT current_database()")]
        (.next rs)
        (.getString rs 1)))))

;; A native query can switch its connection's database. That lasts for the session, and Metabase doesn't qualify
;; tables with the database, so later queries on the same pooled connection would read the other database.
(deftest switched-database-does-not-leak-into-pooled-connections-test
  (mt/test-driver :motherduck
    (let [test-db  (pooled-current-database)
          other-db (tx/db-test-env-var :motherduck :server-dbname "my_db")
          mp       (mt/metadata-provider)]
      (try
        (doseq [sql [(format "USE \"%s\"" other-db)
                     (format "SET search_path = '%s.main'" other-db)
                     (format "SET schema = '%s.main'" other-db)]]
          (testing sql
            (with-pooled-connection
              (fn [^Connection conn]
                (with-open [stmt (.createStatement conn)]
                  (.execute stmt ^String sql))))
            (testing "later checkouts are back on the connection's own database"
              (is (= (repeat 5 test-db)
                     (repeatedly 5 pooled-current-database))))
            (testing "MBQL queries still find their tables"
              (is (= [[100]]
                     (mt/rows (qp/process-query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                    (lib/aggregate (lib/count))))))))))
        (finally
          (sql-jdbc.conn/invalidate-pool-for-db! (mt/id)))))))

(mt/defdataset pk-leak-a
  [["placeholder" [{:field-name "x", :base-type :type/Integer}] [[1]]]])

(mt/defdataset pk-leak-b
  [["placeholder" [{:field-name "x", :base-type :type/Integer}] [[1]]]])

(defn- execute-statements! [& statements]
  (with-pooled-connection
    (fn [^Connection conn]
      (doseq [^String sql statements]
        (with-open [stmt (.createStatement conn)]
          ;; The endpoint returns result sets for DDL, which executeUpdate rejects.
          (.execute stmt sql))))))

;; The endpoint's information_schema.table_constraints and key_column_usage list every database in the account. A
;; field sync that reads them without the database takes primary keys from same-named tables elsewhere.
(deftest describe-fields-reads-only-the-current-database-test
  (mt/test-driver :motherduck
    (mt/dataset pk-leak-b
      (execute-statements! "CREATE OR REPLACE TABLE only_b_pk (id INTEGER PRIMARY KEY, v INTEGER)"
                           "CREATE OR REPLACE TABLE diff_pk (id INTEGER, v INTEGER PRIMARY KEY)"
                           "CREATE OR REPLACE TABLE both_pk (id INTEGER PRIMARY KEY, v INTEGER)"
                           "COMMENT ON COLUMN both_pk.v IS 'from the other database'"))
    (mt/dataset pk-leak-a
      (execute-statements! "CREATE OR REPLACE TABLE only_b_pk (id INTEGER, v INTEGER)"
                           "CREATE OR REPLACE TABLE diff_pk (id INTEGER PRIMARY KEY, v INTEGER)"
                           "CREATE OR REPLACE TABLE both_pk (id INTEGER PRIMARY KEY, v INTEGER)"
                           "COMMENT ON COLUMN diff_pk.v IS 'from this database'")
      (testing "each column appears once, with its own database's primary key and comment"
        (is (= [["both_pk"   "id" true  nil]
                ["both_pk"   "v"  false nil]
                ["diff_pk"   "id" true  nil]
                ["diff_pk"   "v"  false "from this database"]
                ["only_b_pk" "id" false nil]
                ["only_b_pk" "v"  false nil]]
               (into []
                     (map (juxt :table-name :name :pk? :field-comment))
                     (driver/describe-fields :motherduck
                                             (lib.metadata/database (mt/metadata-provider))
                                             :table-names ["both_pk" "diff_pk" "only_b_pk"]))))))))
