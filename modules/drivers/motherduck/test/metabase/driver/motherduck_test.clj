(ns ^:mb/driver-tests metabase.driver.motherduck-test
  "SQL compilation and connection tests for the MotherDuck driver."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   ;; Register the driver before testing its methods.
   [metabase.driver.motherduck]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.pivot :as lib.pivot]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.nest-for-pivot :as nest-for-pivot]
   [metabase.sync.core :as sync]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection ResultSet ResultSetMetaData SQLException Types)
   (java.time LocalDateTime OffsetTime)))

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

(deftest ^:parallel duckdb-only-base-types-test
  (are [database-type base-type] (= base-type (sql-jdbc.sync/database-type->base-type :motherduck database-type))
    :duckdb_enum         :type/Text
    :duckdb_timestamp_ns :type/DateTime
    :timestamp           :type/DateTime
    :duckdb_struct       nil))

(deftest ^:parallel read-timestamp-ns-test
  (are [s expected] (= expected (read-unparseable Types/DISTINCT "duckdb_timestamp_ns" s))
    nil                             nil
    "2024-03-05 12:34:56.123456789" (LocalDateTime/of 2024 3 5 12 34 56 123456789)
    "1999-12-31 23:59:59"           (LocalDateTime/of 1999 12 31 23 59 59)
    "1700-01-01 00:00:00.5"         (LocalDateTime/of 1700 1 1 0 0 0 500000000)
    "infinity"                      LocalDateTime/MAX
    "-infinity"                     LocalDateTime/MIN))

(deftest ^:parallel connection-spec-verifies-the-server-test
  (let [details {:host     "pg.us-east-1-aws.motherduck.com"
                 :port     5432
                 :dbname   "my_db"
                 :user     "metabase"
                 :password "placeholder"
                 :ssl      true}]
    (testing "the connection verifies the server's certificate and hostname against the JVM trust store"
      (is (=? {:user        "postgres" ; the endpoint ignores the user name, so a saved one is replaced
               :sslmode     "verify-full"
               :sslfactory  "org.postgresql.ssl.DefaultJavaSSLFactory"
               :classname   "org.postgresql.Driver"
               :subprotocol "postgresql"}
              (sql-jdbc.conn/connection-details->spec :motherduck details))))
    (testing "through an SSH tunnel, where the host is localhost, it verifies only the certificate"
      (is (=? {:sslmode    "verify-ca"
               :sslfactory "org.postgresql.ssl.DefaultJavaSSLFactory"}
              (sql-jdbc.conn/connection-details->spec :motherduck (assoc details :tunnel-enabled true)))))))

(deftest ^:parallel connection-form-test
  (let [field-names (into #{}
                          (comp (mapcat #(:fields % [%])) ; host and port are in a group
                                (map :name))
                          (driver/connection-properties :motherduck))]
    (testing "the token field and its guidance are on the form"
      (is (every? field-names ["host" "port" "dbname" "token-info" "password"])))
    (testing "the ignored user name and the always-on SSL toggle aren't"
      (is (not-any? field-names ["user" "ssl"]))))
  (testing "Postgres's hosting providers aren't recognized, but its field groups are kept"
    (is (=? {:providers    []
             :field-groups [{:id "host-and-port"}]}
            (driver/extra-info :motherduck)))))

;; Messages as the live endpoint sends them; `live-connection-errors-test` checks the endpoint still does.
(deftest ^:parallel humanize-connection-error-message-test
  (are [message expected] (= expected (driver/humanize-connection-error-message :motherduck [message]))
    "FATAL: invalid username/password"
    :password-incorrect

    "FATAL: could not connect to database: Invalid Input Error: Failed to attach 'x': no database/share named \"x\" found"
    :database-name-incorrect

    ;; anything else goes to the Postgres mapping
    "FATAL: something else"
    "Something else."))

(deftest live-connection-errors-test
  (mt/test-driver :motherduck
    (let [details (tx/dbdef->connection-details :motherduck :server nil)
          error   (fn [details]
                    (try (driver/can-connect? :motherduck details)
                         nil
                         (catch Exception e
                           (driver/humanize-connection-error-message :motherduck [(ex-message e)]))))]
      (testing "no user name is needed"
        (is (true? (driver/can-connect? :motherduck (dissoc details :user)))))
      (testing "a bad token"
        (is (= :password-incorrect (error (assoc details :password "not-a-token")))))
      (testing "a database that doesn't exist"
        (is (= :database-name-incorrect (error (assoc details :dbname "no_such_database_que_1021"))))))))

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

;; pgjdbc sets the session time zone to the JVM's, but the endpoint's `SHOW TIMEZONE` always answers UTC. Tests run
;; on a UTC JVM, so use another zone to tell them apart.
(deftest db-default-timezone-test
  (mt/test-driver :motherduck
    (try
      (mt/with-system-timezone-id! "Asia/Tokyo"
        ;; A new pool opens its connections in the JVM's current time zone.
        (sql-jdbc.conn/invalidate-pool-for-db! (mt/id))
        (is (= "Asia/Tokyo"
               (driver/db-default-timezone :motherduck (lib.metadata/database (mt/metadata-provider))))))
      (finally
        (sql-jdbc.conn/invalidate-pool-for-db! (mt/id))))))

(mt/defdataset pk-leak-a
  [["placeholder" [{:field-name "x", :base-type :type/Integer}] [[1]]]])

(mt/defdataset pk-leak-b
  [["placeholder" [{:field-name "x", :base-type :type/Integer}] [[1]]]])

(defn- exec!
  "Execute `statements` against the database whose spec is passed as the first param."
  [spec statements]
  (sql-jdbc.execute/do-with-connection-with-options
   :motherduck spec {:write? true}
   (fn [^Connection conn]
     (with-open [stmt (.createStatement conn)]
       ;; The endpoint returns result sets for DDL, which executeUpdate rejects.
       (doseq [^String statement statements]
         (.execute stmt statement))))))

;; The endpoint names DuckDB-only types `duckdb_*` and sends their values as text.
(deftest duckdb-only-types-test
  (mt/test-driver :motherduck
    (let [details (mt/dbdef->connection-details :motherduck :db {:database-name "duckdb_only_types_test"})]
      (tx/drop-if-exists-and-create-db! :motherduck "duckdb_only_types_test")
      (exec! (sql-jdbc.conn/connection-details->spec :motherduck details)
             ["CREATE TYPE mood AS ENUM ('sad', 'happy');"
              "CREATE TABLE duckdb_types (id INTEGER, m mood, ts TIMESTAMP_NS);"
              (str "INSERT INTO duckdb_types VALUES (1, 'happy', '2024-03-05 12:34:56.123456789'),"
                   " (2, 'sad', '1999-12-31 23:59:59'), (3, NULL, NULL);")])
      (mt/with-temp [:model/Database database {:engine :motherduck, :details details}]
        (mt/with-db database
          (sync/sync-database! (:id database))
          (testing "ENUM syncs as text and TIMESTAMP_NS as a timestamp"
            (is (= {"id" :type/Integer, "m" :type/Text, "ts" :type/DateTime}
                   (t2/select-fn->fn :name :base_type :model/Field :table_id (mt/id :duckdb_types)))))
          (let [mp    (mt/metadata-provider)
                query (lib/query mp (lib.metadata/table mp (mt/id :duckdb_types)))
                m     (lib.metadata/field mp (mt/id :duckdb_types :m))
                ts    (lib.metadata/field mp (mt/id :duckdb_types :ts))
                run   #(mt/rows (qp/process-query %))]
            (testing "values read as strings and timestamps, keeping nanoseconds"
              (is (= [[1 "happy" "2024-03-05T12:34:56.123456789Z"]
                      [2 "sad" "1999-12-31T23:59:59Z"]
                      [3 nil nil]]
                     (run (lib/order-by query (lib.metadata/field mp (mt/id :duckdb_types :id)))))))
            (testing "filters compare enums with text and TIMESTAMP_NS with timestamps"
              (is (= [[1]]
                     (run (-> query (lib/filter (lib/= m "happy")) (lib/aggregate (lib/count))))))
              (is (= [[1]]
                     (run (-> query (lib/filter (lib/> ts "2000-01-01")) (lib/aggregate (lib/count)))))))
            (testing "TIMESTAMP_NS buckets by month"
              (is (= [["1999-12-01T00:00:00Z" 1]
                      ["2024-03-01T00:00:00Z" 1]
                      [nil 1]]
                     (run (-> query
                              (lib/aggregate (lib/count))
                              (lib/breakout (lib/with-temporal-bucket ts :month)))))))))))))

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

(mt/defdataset estimated-row-counts
  [["placeholder" [{:field-name "x", :base-type :type/Integer}] [[1]]]])

(deftest describe-database-estimated-row-count-test
  (mt/test-driver :motherduck
    (mt/dataset estimated-row-counts
      (execute-statements! "CREATE OR REPLACE TABLE three_rows (x INTEGER)"
                           "INSERT INTO three_rows VALUES (1), (2), (3)"
                           "CREATE OR REPLACE TABLE no_rows (x INTEGER)"
                           "CREATE OR REPLACE VIEW three_rows_view AS SELECT * FROM three_rows")
      (testing "tables report their row count, except that 0 is reported as unknown; views have none"
        (is (= {"no_rows"         nil
                "three_rows"      3
                "three_rows_view" nil}
               (into {}
                     (comp (filter (comp #{"no_rows" "three_rows" "three_rows_view"} :name))
                           (map (juxt :name :estimated_row_count)))
                     (:tables (driver/describe-database :motherduck
                                                        (lib.metadata/database (mt/metadata-provider)))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                MotherDuck copies of Postgres-only tests                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

;; MotherDuck inherits this behaviour from `:postgres`, but these tests need different SQL, setup or expectations
;; here, so they're copies of tests in `metabase.driver.postgres-test` rather than shared with it.

(deftest default-schema-test
  (mt/test-driver :motherduck
    ;; Unlike Postgres, `currentSchema` can't be set in the additional options: the endpoint refuses the startup
    ;; option with "FATAL: option is not allowed: search_path".
    (is (= "main"
           (driver.sql/default-schema :motherduck (lib.metadata/database (mt/metadata-provider)))))))

(deftest recreated-views-test
  (mt/test-driver :motherduck
    (testing (str "make sure that if a view is dropped and recreated that the original Table object is marked active "
                  "rather than a new one being created (#3331)")
      (let [details (mt/dbdef->connection-details :motherduck :db {:database-name "dropped_views_test"})
            spec    (sql-jdbc.conn/connection-details->spec :motherduck details)]
        (tx/drop-if-exists-and-create-db! :motherduck "dropped_views_test")
        (mt/with-temp [:model/Database database {:engine :motherduck, :details details}]
          (let [sync! #(sync/sync-database! (:id database))]
            (exec! spec ["CREATE table birds (name VARCHAR UNIQUE NOT NULL);"
                         "INSERT INTO birds (name) VALUES ('Rasta'), ('Lucky'), ('Parroty');"
                         "CREATE VIEW angry_birds AS SELECT upper(name) AS name FROM birds;"])
            (sync!)
            (exec! spec ["DROP VIEW angry_birds;"])
            (sync!)
            (exec! spec ["CREATE VIEW angry_birds AS SELECT upper(name) AS name FROM birds;"])
            (sync!)
            ;; there should be only one Table for the view
            (is (= [{:name "angry_birds", :active true}]
                   (map (partial into {})
                        (t2/select [:model/Table :name :active] :db_id (u/the-id database), :name "angry_birds"))))))))))

(defn- describe-trivial-json-table!
  "Create `schema`.`table` with a JSON column in a new database, sync it, and describe its nested JSON fields."
  [db-name schema table]
  (tx/drop-if-exists-and-create-db! :motherduck db-name)
  (let [details (mt/dbdef->connection-details :motherduck :db {:database-name db-name, :json-unfolding true})
        quoted  (str (sql.u/quote-name :motherduck :schema schema) "." (sql.u/quote-name :motherduck :table table))]
    (exec! (sql-jdbc.conn/connection-details->spec :motherduck details)
           [(str "CREATE SCHEMA " (sql.u/quote-name :motherduck :schema schema) ";")
            (str "CREATE TABLE " quoted " (trivial_json JSON NOT NULL);")
            (str "INSERT INTO " quoted " (trivial_json) VALUES ('{\"a\": 1}');")])
    (mt/with-temp [:model/Database database {:engine :motherduck, :details details}]
      (mt/with-db database
        (sync-tables/sync-tables-and-database! (driver.u/lib-database (:id database)))
        (sql-jdbc.sync/describe-nested-field-columns
         :motherduck
         (driver.u/lib-database (:id database))
         {:schema schema :name table :id (mt/id table)})))))

(def ^:private trivial-json-nested-fields
  #{{:name              "trivial_json → a",
     :database-type     "decimal",
     :base-type         :type/Integer,
     :database-position 0,
     :json-unfolding    false,
     :visibility-type   :normal,
     :nfc-path          [:trivial_json "a"]}})

(deftest describe-nested-field-columns-identifier-test
  (mt/test-driver :motherduck
    (testing "sync goes and runs with identifier if there is a schema other than the default one"
      (is (= trivial-json-nested-fields
             (describe-trivial-json-table! "describe-json-with-schema-test" "bobdobbs" "describe_json_table"))))))

(deftest describe-funky-name-table-nested-field-columns-test
  (mt/test-driver :motherduck
    (testing "sync goes and still works with funky schema and table names, including caps and special chars (#23026, #23027)"
      (is (= trivial-json-nested-fields
             (describe-trivial-json-table! "describe-json-funky-names-test" "AAAH_#" "dESCribe_json_table_%"))))))

(deftest query-canceled?-test
  (mt/test-driver :motherduck
    (testing "Recognizes timeout exceptions"
      ;; DuckDB has no pg_sleep; counting 10^11 rows takes far longer than the timeout
      (sql-jdbc.execute/do-with-connection-with-options
       :motherduck (mt/id) nil
       (fn [^Connection conn]
         (with-open [stmt (.prepareStatement conn "SELECT count(*) FROM range(100000000000)")]
           (try (doto stmt
                  (.setQueryTimeout 1)
                  (.execute))
                (throw (ex-info "Query successfully executed. Should run for longer than the timeout of 1s" {}))
                (catch Throwable e
                  (is (driver/query-canceled? :motherduck e))))))))))

(deftest ^:synchronized reducible-query-streams-large-result-set-test
  (mt/test-driver :motherduck
    (testing "reducible-query streams large result sets via a server-side cursor (autoCommit=false)"
      ;; The range table function streams ~2.1 billion rows (DuckDB's generate_series in the SELECT list returns one
      ;; list instead). Pulling just the first few is fast only if reducible-query streams and stops early.
      (let [result (sql-jdbc.execute/reducible-query
                    (lib.metadata/database (mt/metadata-provider))
                    [(format "SELECT range AS i FROM range(1, %d)" Integer/MAX_VALUE)])]
        (testing "only the first rows are pulled, not all ~2 billion"
          (is (= [1 2 3] (into [] (comp (take 3) (map :i)) result))))))))

;;; JSON unfolding: MotherDuck extracts with `json_extract_string` and an inlined JSON Pointer, where Postgres uses
;;; `#>>` with the path keys as parameters.

(deftest ^:parallel json-field-test
  (mt/test-driver :motherduck
    (testing "Deal with complicated identifier (#22967)"
      (mt/with-metadata-provider (lib.tu/mock-metadata-provider
                                  {:database (assoc meta/database :engine :motherduck, :id 1)
                                   :tables   [(merge (meta/table-metadata :venues)
                                                     {:id     1
                                                      :db-id  1
                                                      :name   "complicated_identifiers"
                                                      :schema nil})]
                                   :fields   [(merge (meta/field-metadata :venues :id)
                                                     {:id            1
                                                      :table-id      1
                                                      :nfc-path      ["jsons" "values" "qty"]
                                                      :database-type "integer"})]})
        (let [field-clause [:field
                            {:lib/uuid (str (random-uuid))
                             :binning
                             {:strategy  :num-bins
                              :num-bins  100
                              :min-value 0.75
                              :max-value 54.0
                              :bin-width 0.75}}
                            1]]
          (is (= ["((FLOOR(((CAST(JSON_EXTRACT_STRING(complicated_identifiers.jsons, '/values/qty') AS integer) - 0.75) / 0.75)) * 0.75) + 0.75)"]
                 (sql/format-expr (sql.qp/->honeysql :motherduck field-clause) {:nested true}))))))))

(def ^:private json-alias-mock-metadata-provider
  (lib.tu/mock-metadata-provider
   {:database (assoc meta/database :engine :motherduck, :id 1)
    :tables   [(merge (meta/table-metadata :venues)
                      {:id     1
                       :db-id  1
                       :name   "json_alias_test"
                       :schema nil})]
    :fields   [(merge (meta/field-metadata :venues :id)
                      {:id            1
                       :table-id      1
                       :name          "json_alias_test"
                       :nfc-path      ["bob"
                                       "injection' OR 1=1--' AND released = 1"
                                       "injection' OR 1=1--' AND released = 1"]
                       :database-type "VARCHAR"})]}))

(defn- compile-lines [query]
  (let [{sql :query, params :params} (qp.compile/compile (lib.convert/->mbql5 query))]
    {:lines  (str/split-lines (driver/prettify-native-form :motherduck sql))
     :params params}))

(deftest ^:parallel json-alias-test
  (mt/test-driver :motherduck
    (testing "json breakouts and order bys have alias coercion"
      (mt/with-metadata-provider json-alias-mock-metadata-provider
        ;; a function, to avoid a duplicate `:lib/uuid`
        (let [field-bucketed-fn (fn []
                                  [:field
                                   {:temporal-unit                                              :month
                                    :metabase.query-processor.util.add-alias-info/source-table  1
                                    :metabase.query-processor.util.add-alias-info/source-alias  "dontwannaseethis"
                                    :metabase.query-processor.util.add-alias-info/desired-alias "dontwannaseethis"
                                    :metabase.query-processor.util.add-alias-info/position      1}
                                   1])]
          (is (= {:lines  ["SELECT"
                           "  DATE_TRUNC("
                           "    'month',"
                           "    CAST("
                           "      CAST("
                           "        JSON_EXTRACT_STRING("
                           "          \"json_alias_test\".\"bob\","
                           "          '/injection'' OR 1=1--'' AND released = 1/injection'' OR 1=1--'' AND released = 1'"
                           "        ) AS VARCHAR"
                           "      ) AS timestamp"
                           "    )"
                           "  ) AS \"json_alias_test\","
                           "  COUNT(*) AS \"count\""
                           "FROM"
                           "  \"json_alias_test\""
                           "GROUP BY"
                           "  \"json_alias_test\""
                           "ORDER BY"
                           "  \"json_alias_test\" ASC"]
                  ;; the path is an escaped literal, not parameters
                  :params nil}
                 (compile-lines {:database 1
                                 :type     :query
                                 :query    {:source-table 1
                                            :aggregation  [[:count]]
                                            :breakout     [(field-bucketed-fn)]
                                            :order-by     [[:asc (field-bucketed-fn)]]}}))))))))

(deftest ^:parallel json-alias-test-2
  (mt/test-driver :motherduck
    (testing "json breakouts and order bys have alias coercion"
      (mt/with-metadata-provider json-alias-mock-metadata-provider
        (is (= ["SELECT"
                "  CAST("
                "    JSON_EXTRACT_STRING("
                "      \"json_alias_test\".\"bob\","
                "      '/injection'' OR 1=1--'' AND released = 1/injection'' OR 1=1--'' AND released = 1'"
                "    ) AS VARCHAR"
                "  ) AS \"json_alias_test\""
                "FROM"
                "  \"json_alias_test\""
                "ORDER BY"
                "  \"json_alias_test\" ASC"
                "LIMIT"
                "  1048575"]
               (:lines (compile-lines {:database 1
                                       :type     :query
                                       :query    {:source-table 1
                                                  :order-by     [[:asc [:field {} 1]]]}}))))))))

(def ^:private json-alias-in-model-mock-metadata-provider
  (providers.mock/mock-metadata-provider
   json-alias-mock-metadata-provider
   {:cards [{:name          "Model with JSON"
             :id            123
             :database-id   1
             :dataset-query {:database 1
                             :type     :query
                             :query    {:source-table 1
                                        :aggregation  [[:count]]
                                        :breakout     [[:field 1 nil]]}}}]}))

(deftest ^:parallel json-breakout-in-model-test
  (mt/test-driver :motherduck
    (testing "JSON columns in inner queries are referenced properly in outer queries #34930"
      (mt/with-metadata-provider json-alias-in-model-mock-metadata-provider
        (is (= ["WITH \"__mb_stage_0\" AS ("
                "  SELECT"
                "    CAST("
                "      JSON_EXTRACT_STRING("
                "        \"json_alias_test\".\"bob\","
                "        '/injection'' OR 1=1--'' AND released = 1/injection'' OR 1=1--'' AND released = 1'"
                "      ) AS VARCHAR"
                "    ) AS \"json_alias_test\","
                "    COUNT(*) AS \"count\""
                "  FROM"
                "    \"json_alias_test\""
                "  GROUP BY"
                "    \"json_alias_test\""
                "  ORDER BY"
                "    \"json_alias_test\" ASC"
                ")"
                "SELECT"
                "  \"__mb_source\".\"json_alias_test\" AS \"json_alias_test\","
                "  \"__mb_source\".\"count\" AS \"count\""
                "FROM"
                "  \"__mb_stage_0\" AS \"__mb_source\""]
               (:lines (compile-lines {:database (meta/id)
                                       :type     :query
                                       :query    {:source-table "card__123"}}))))))))

(deftest ^:parallel nested-field-pivot-compile-test
  (mt/test-driver :motherduck
    (testing "Pivot with a nested-field (JSON-unfolded) breakout compiles to a derived table that pre-computes the JSON path expression and references plain identifiers in GROUPING SETS / GROUPING"
      (let [mp       (lib.tu/mock-metadata-provider
                      {:database (assoc meta/database :engine :motherduck :id 1)
                       :tables   [(merge (meta/table-metadata :venues)
                                         {:id 1 :db-id 1 :name "json_table" :schema nil})]
                       :fields   [(merge (meta/field-metadata :venues :id)
                                         {:id             1
                                          :table-id       1
                                          :name           "category"
                                          :nfc-path       ["payload" "category"]
                                          :base-type      :type/Text
                                          :effective-type :type/Text
                                          :database-type  "text"})
                                  (merge (meta/field-metadata :venues :name)
                                         {:id 2 :table-id 1 :name "region"})]})
            base     (-> (lib/query mp (lib.metadata/table mp 1))
                         (lib/breakout (lib.metadata/field mp 1))
                         (lib/breakout (lib.metadata/field mp 2))
                         (lib/aggregate (lib/count)))
            bks      (lib/breakouts base)
            pivot-q  (lib.pivot/with-pivot base
                       {:rows               [(lib.options/uuid (first bks))]
                        :columns            [(lib.options/uuid (second bks))]
                        :show-row-totals    true
                        :show-column-totals true})]
        (mt/with-metadata-provider mp
          (is (= ["WITH \"__mb_stage_0\" AS ("
                  "  SELECT"
                  "    CAST("
                  "      JSON_EXTRACT_STRING(\"json_table\".\"payload\", '/category') AS text"
                  "    ) AS \"category\","
                  "    \"json_table\".\"region\" AS \"region\","
                  "    CAST("
                  "      JSON_EXTRACT_STRING(\"json_table\".\"payload\", '/category') AS text"
                  "    ) AS \"__mb_pivot_nfc\""
                  "  FROM"
                  "    \"json_table\""
                  ")"
                  "SELECT"
                  "  \"__mb_source\".\"__mb_pivot_nfc\" AS \"__mb_pivot_nfc\","
                  "  \"__mb_source\".\"region\" AS \"region\","
                  "  GROUPING("
                  "    \"__mb_source\".\"region\","
                  "    \"__mb_source\".\"__mb_pivot_nfc\""
                  "  ) AS \"pivot-grouping\","
                  "  COUNT(*) AS \"count\""
                  "FROM"
                  "  \"__mb_stage_0\" AS \"__mb_source\""
                  "GROUP BY"
                  "  GROUPING SETS ("
                  "    ("
                  "      \"__mb_source\".\"__mb_pivot_nfc\","
                  "      \"__mb_source\".\"region\""
                  "    ),"
                  "    (\"__mb_source\".\"region\"),"
                  "    (\"__mb_source\".\"__mb_pivot_nfc\"),"
                  "    ()"
                  "  )"
                  "ORDER BY"
                  "  GROUPING("
                  "    \"__mb_source\".\"region\","
                  "    \"__mb_source\".\"__mb_pivot_nfc\""
                  "  ) DESC,"
                  "  \"__mb_source\".\"__mb_pivot_nfc\" ASC,"
                  "  \"__mb_source\".\"region\" ASC"]
                 (str/split-lines
                  (driver/prettify-native-form
                   :motherduck
                   (:query (qp.compile/compile (nest-for-pivot/wrap-nested-field-breakouts pivot-q))))))))))))
