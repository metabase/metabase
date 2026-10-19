(ns ^:mb/driver-tests metabase.driver.sqlite-test
  (:require
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.driver.util :as driver.u]
   [metabase.models.serialization :as serdes]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest unsupported-db-forms-test
  ;; Only a plain file path or a local `file:` URI, without a `?` in either, names a database. Everything else SQLite
  ;; or sqlite-jdbc accepts -- in-memory names, `:resource:` downloads, other URL schemes, parameters -- is refused.
  (mt/with-premium-features #{}
    (doseq [db [nil
                ""
                "   "
                ":memory:"
                " :memory:"
                "file::memory:"
                "file::memory:?cache=shared"
                "file:/etc/x.db?mode=ro"
                "file:/etc/x.db?mode=memory"
                "file:/etc/x.db?vfs=memdb"
                "file:x.db?mode=ro"
                "file:/etc/x.db?"
                ;; even where SQLite would read it as part of the dropped `#` fragment: any `?` is refused
                "file:/etc/x.db#frag?mode=memory"
                ":resource:file:/etc/x.db"
                ":resource:http://example.com/x.db"
                ":resource: file:/etc/x.db"
                ":resource:url:file:/etc/x.db"
                ":resource:jar:file:/etc/x.jar!/x.db"
                ":RESOURCE:file:/etc/x.db"
                "jar:file:/etc/x.jar!/x.db"
                "http://example.com/x.db"
                "https://example.com/x.db"
                " https://example.com/x.db"
                "ftp://example.com/x.db"
                ;; SQLite's `file:` prefix is case-sensitive, so this would be a relative path named `FILE:`
                "FILE:/etc/x.db"
                ;; SQLite refuses any authority but an empty one or `localhost`
                "file://example.com/etc/x.db"
                ;; sqlite-jdbc strips its own settings from after a `?` in a plain path too, so the file it opens is not
                ;; the one the path checks would normalize this to
                "/etc/x.db?jdbc.explicit_readonly=../../allowed-dir/x.db"
                "/etc/x.db?mode=memory"
                "/etc/x.db?"
                "x.db?foo=bar"
                ;; refused even where it is part of the file name
                "/allowed-dir/we?ird.db"]]
      (testing (pr-str db)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"SQLite database must be a file path or a file: URI"
                              (driver/validate-db-details! :sqlite {:db db})))))
    (testing "a Windows drive letter is a path, not a URL scheme"
      (is (nil? (driver/validate-db-details! :sqlite {:db "C:\\data\\x.db"}))))))

(deftest db-file-must-be-in-readable-paths-test
  ;; the database file is a path on the Metabase host that an admin types in, so it has to be somewhere
  ;; `readable-paths` allows -- in either form that names a file
  (mt/with-premium-features #{}
    (mt/with-temp-env-var-value! [mb-readable-paths "/allowed-dir"]
      (testing "a file outside the allowed directories is refused"
        (doseq [db ["/etc/x.db"
                    "/allowed-dir/../etc/x.db"
                    "file:/etc/x.db"
                    "file:///etc/x.db"
                    "file://localhost/etc/x.db"
                    ;; SQLite drops a URI's `#` fragment, `..` segments in it included
                    "file:/etc/x.db#/../../allowed-dir/x.db"
                    ;; a relative `file:` URI names a file relative to the working directory
                    "file:x.db"
                    ;; SQLite decodes each well-formed escape on its own, whatever else the path holds
                    "file:/allowed-dir/%zz/%2E%2E/%2E%2E/etc/x.db"
                    ;; and a decoded NUL ends the path
                    "file:/etc/x.db%00/../../allowed-dir/x.db"
                    ;; surrounding whitespace is part of a path, which then names a file relative to the working
                    ;; directory
                    " /allowed-dir/x.db"
                    " file:/etc/x.db"]]
          (testing db
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Reading from path is disallowed"
                                  (driver/validate-db-details! :sqlite {:db db}))))))
      (testing "a file inside one is allowed"
        (doseq [db ["/allowed-dir/x.db"
                    "file:/allowed-dir/x.db"
                    "file:/allowed-dir/x.db#frag"
                    "file://localhost/allowed-dir/x.db"
                    "file:/allowed-dir/100%25.db"
                    "file:/allowed-dir/50%.db"
                    "/allowed-dir/x.db "]]
          (testing db
            (is (nil? (driver/validate-db-details! :sqlite {:db db})))))))))

(defn- do-with-temp-file!
  "Call `f` with the path of a new empty temp file ending in `suffix`, and delete it afterwards, along with any journal
  SQLite left beside it."
  [suffix f]
  (let [path (.getPath (java.io.File/createTempFile "sqlite-test" suffix))]
    (try
      (f path)
      (finally
        (doseq [file [path (str path "-journal") (str path "-wal") (str path "-shm")]]
          (io/delete-file file true))))))

(defn- do-with-temp-sqlite-file!
  "Call `f` with the path of a new SQLite database file holding an empty table `t`, and delete it afterwards."
  [f]
  (do-with-temp-file!
   ".sqlite"
   (fn [path]
     (jdbc/execute! {:classname "org.sqlite.JDBC" :subprotocol "sqlite" :subname path} ["CREATE TABLE t (x INTEGER)"])
     (f path))))

(deftest can-connect-reads-only-the-checked-file-test
  (testing "the connection check reads the header of the local file the path checks validated"
    (mt/with-premium-features #{}
      (do-with-temp-sqlite-file!
       (fn [path]
         (is (true? (driver/can-connect? :sqlite {:db path})))
         (is (true? (driver/can-connect? :sqlite {:db (str "file:" path)})))
         (testing "a file that is not a SQLite database fails the check"
           (do-with-temp-file!
            ".txt"
            (fn [other]
              (spit other "not a database")
              (is (false? (driver/can-connect? :sqlite {:db other}))))))
         (testing "an unsupported form is refused before anything is read"
           (doseq [db [":memory:" (str "file:" path "?mode=memory")]]
             (is (thrown-with-msg? clojure.lang.ExceptionInfo #"SQLite database must be a file path or a file: URI"
                                   (driver/can-connect? :sqlite {:db db}))))))))))

(deftest db-file-must-be-in-writable-paths-test
  ;; every connection opens the file read-write (and can write its journal), so `writable-paths` applies as well
  (mt/with-premium-features #{}
    (mt/with-temp-env-var-value! [mb-writable-paths "/allowed-dir"]
      (testing "a file outside the writable paths is refused"
        (doseq [details [{:db "/etc/x.db"}
                         {:db "file:/etc/x.db"}
                         ;; the driver does not open a connection read-only, so such a detail exempts nothing
                         {:db "/etc/x.db" :read-only? true}]]
          (testing (pr-str details)
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Writing to path is disallowed"
                                  (driver/validate-db-details! :sqlite details))))))
      (testing "a file inside the writable paths is allowed"
        (is (nil? (driver/validate-db-details! :sqlite {:db "/allowed-dir/x.db"})))))))

(defn- native-rows [database sql]
  (mt/rows (qp/process-query {:database (u/the-id database), :type :native, :native {:query sql}})))

(deftest stored-database-rows-are-checked-when-connecting-test
  ;; A Database row can reach the app DB without a connection test, e.g. from a serialization import or from before
  ;; the path settings were set, so opening a connection for one applies the same checks.
  (do-with-temp-sqlite-file!
   (fn [path]
     (mt/with-premium-features #{}
       (mt/with-temp [:model/Database database {:engine :sqlite :details {:db path}}
                      :model/Database in-memory {:engine :sqlite :details {:db ":memory:"}}
                      :model/Database no-path {:engine :sqlite :details {}}]
         (testing "a query opens a file the path settings allow"
           (is (= [] (native-rows database "SELECT x FROM t"))))
         (testing "a query is refused when the readable paths exclude the file"
           (mt/with-temp-env-var-value! [mb-readable-paths "/allowed-dir"]
             (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Reading from path is disallowed"
                                   (native-rows database "SELECT x FROM t")))))
         (testing "a query on a writable connection is refused when the writable paths exclude the file"
           (mt/with-temp-env-var-value! [mb-writable-paths "/allowed-dir"]
             (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Writing to path is disallowed"
                                   (native-rows database "SELECT x FROM t")))))
         (testing "a query on an unsupported form is refused"
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"SQLite database must be a file path or a file: URI"
                                 (native-rows in-memory "SELECT 1"))))
         (testing "a query on a row whose path carries sqlite-jdbc settings after a `?` is refused"
           (mt/with-temp [:model/Database with-settings {:engine  :sqlite
                                                         :details {:db (str path "?jdbc.explicit_readonly=../x.db")}}]
             (is (thrown-with-msg? clojure.lang.ExceptionInfo #"SQLite database must be a file path or a file: URI"
                                   (native-rows with-settings "SELECT x FROM t")))))
         (testing "a query on a row with no database path is refused"
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"SQLite database must be a file path or a file: URI"
                                 (native-rows no-path "SELECT 1")))))))))

(deftest serialization-imported-database-is-checked-when-connecting-test
  (testing "a SQLite database written by a serialization import cannot be queried outside the readable paths"
    (do-with-temp-sqlite-file!
     (fn [path]
       (mt/with-premium-features #{}
         (mt/with-temp-env-var-value! [mb-readable-paths "/allowed-dir"]
           (let [database (serdes/load-one! {:serdes/meta [{:model "Database" :id "Imported SQLite"}]
                                             :name        "Imported SQLite"
                                             :engine      "sqlite"
                                             :details     {:db path}
                                             :created_at  "2026-01-01T00:00:00Z"
                                             :updated_at  "2026-01-01T00:00:00Z"}
                                            nil)]
             (try
               (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Reading from path is disallowed"
                                     (native-rows database "SELECT x FROM t")))
               (finally
                 (t2/delete! :model/Database :id (u/the-id database)))))))))))

(deftest ^:parallel timezone-id-test
  (mt/test-driver :sqlite
    (is (= "UTC"
           (driver/db-default-timezone :sqlite (mt/db))))))

(deftest ^:parallel hour-bucketing-time-without-database-type-test
  (testing (str "Hour bucketing on a TIME-typed expression without `:database-type` (as happens for "
                "fields referenced by name from a source query, #75193) should use the time-aware path "
                "and not produce a DATETIME-format result")
    (let [expr (h2x/with-type-info :test_col {:effective-type :type/Time})]
      (is (= ["TIME(STRFTIME('%H:00', \"test_col\"))"]
             (sql.qp/format-honeysql :sqlite (sql.qp/date :sqlite :hour expr)))))))

(deftest ^:parallel filter-by-date-test
  (testing "Make sure filtering against a LocalDate works correctly in SQLite"
    (mt/test-driver :sqlite
      (is (= [[225 "2014-03-04T00:00:00Z"]
              [409 "2014-03-05T00:00:00Z"]
              [917 "2014-03-05T00:00:00Z"]
              [995 "2014-03-05T00:00:00Z"]
              [159 "2014-03-06T00:00:00Z"]
              [951 "2014-03-06T00:00:00Z"]]
             (mt/rows
              (mt/run-mbql-query checkins
                {:fields   [$id $date]
                 :filter   [:and
                            [:>= $date "2014-03-04"]
                            [:<= $date "2014-03-06"]]
                 :order-by [[:asc $date]]}))
             (mt/rows
              (mt/run-mbql-query checkins
                {:fields   [$id $date]
                 :filter   [:between $date "2014-03-04" "2014-03-07"]
                 :order-by [[:asc $date]]})))))))

(defn- table-fingerprint
  [{:keys [fields name]}]
  {:name   name
   :fields (map #(select-keys % [:name :base_type]) fields)})

(deftest type-inference-for-views
  (mt/test-driver :sqlite
    (testing "Make sure we correctly infer complex types in views (#8630, #9276, #12191, #12547, #10681)"
      (let [details (mt/dbdef->connection-details :sqlite :db {:database-name "views_test"})
            spec    (sql-jdbc.conn/connection-details->spec :sqlite details)]
        (mt/with-temp [:model/Database {db-id :id :as database} {:engine :sqlite, :details (assoc details :dbname "views_test")}]
          (doseq [statement ["drop view if exists v_groupby_test;"
                             "drop table if exists groupby_test;"
                             "drop view if exists v_src;"
                             "drop table if exists src;"
                             "create table if not exists src(id integer, time text);"
                             "create view if not exists v_src as select id, strftime('%s', time) as time from src;"
                             "insert into src values(1, '2020-03-01 12:20:35');"]]
            (jdbc/execute! spec [statement]))
          (sync/sync-database! database)
          (is (= [{:name "src"
                   :fields [{:name      "id"
                             :base_type :type/Integer}
                            {:name      "time"
                             :base_type :type/Text}]}
                  {:name "v_src"
                   :fields [{:name      "id"
                             :base_type :type/Integer}
                            {:name      "time"
                             :base_type :type/Text}]}]
                 (->> (t2/hydrate (t2/select :model/Table :db_id db-id {:order-by [:name]}) :fields)
                      (map table-fingerprint))))
          (doseq [statement ["drop view if exists v_groupby_test;"
                             "drop table if exists groupby_test;"
                             "CREATE TABLE IF NOT EXISTS groupby_test (
                             id INTEGER primary key unique,
                             symbol VARCHAR,
                             dt DATETIME,
                             value FLOAT);"
                             "INSERT INTO groupby_test (symbol, dt, value) VALUES ('T', '2020-01-01', 0);"
                             "INSERT INTO groupby_test (symbol, dt, value) VALUES ('T', '2020-01-02', 2);"
                             "INSERT INTO groupby_test (symbol, dt, value) VALUES ('T', '2020-01-03', 4);"
                             "INSERT INTO groupby_test (symbol, dt, value) VALUES ('S', '2019-01-01', 10);"
                             "CREATE VIEW IF NOT EXISTS v_groupby_test AS
                              SELECT
                               symbol,
                               sum(value) as totalValue
                              FROM groupby_test
                              GROUP BY symbol
                              ORDER by dt;"]]
            (jdbc/execute! spec [statement]))
          (sync/sync-database! database)
          (is (= [{:name "groupby_test"
                   :fields [{:name      "id"
                             :base_type :type/Integer}
                            {:name      "symbol"
                             :base_type :type/Text}
                            {:name      "dt"
                             :base_type :type/DateTime}
                            {:name      "value"
                             :base_type :type/Float}]}
                  {:name "v_groupby_test"
                   :fields [{:name      "symbol"
                             :base_type :type/Text}
                            {:name      "totalValue"
                             :base_type :type/Float}]}]
                 (->> (t2/hydrate (t2/select :model/Table :db_id db-id
                                             {:where    [:in :name ["groupby_test" "v_groupby_test"]]
                                              :order-by [:name]}) :fields)
                      (map table-fingerprint)))))))))

(defn- default-table-result [table-name]
  {:name        table-name
   :schema      nil
   :description nil
   :is_writable nil})

(deftest timestamp-test-db
  (let [driver :sqlite]
    (mt/test-driver driver
      (let [db-name "timestamp_test"
            details (mt/dbdef->connection-details :sqlite :db {:database-name db-name})]
        (doseq [stmt ["DROP TABLE IF EXISTS timestamp_table;"
                      "CREATE TABLE timestamp_table (created_at timestamp);"
                      "INSERT INTO timestamp_table (created_at) VALUES (datetime('now'));"]]
          (jdbc/execute! (sql-jdbc.conn/connection-details->spec driver details)
                         [stmt]))
        (mt/with-temp [:model/Database db {:engine driver :details (assoc details :dbname db-name)}]
          (sync/sync-database! db)
          (mt/with-db db
            (testing "timestamp columns"
              (testing "database should be synced"
                (is (= {:tables (set (map default-table-result ["timestamp_table"]))}
                       (driver/describe-database driver db))))

              (testing "timestamp column should exist"
                (is (=? {:name "timestamp_table"
                         :schema nil
                         :fields [{:name                       "created_at"
                                   :database-type              "TIMESTAMP"
                                   :base-type                  :type/DateTime
                                   :database-position          0
                                   :database-required          false
                                   :json-unfolding             false
                                   :database-is-auto-increment false
                                   :database-is-nullable       true
                                   :database-is-generated      false}]}
                        (-> (driver/describe-table driver db (t2/select-one :model/Table :id (mt/id :timestamp_table)))
                            (update :fields (partial sort-by :name)))))))))))))

(deftest select-query-datetime
  (mt/test-driver :sqlite
    (let [db-name "datetime_test"
          details (mt/dbdef->connection-details :sqlite :db {:database-name db-name})]
      (doseq [stmt ["DROP TABLE IF EXISTS datetime_table;"
                    "CREATE TABLE datetime_table (
                      test_case varchar,
                      col_timestamp timestamp,
                      col_date date,
                      col_datetime datetime);"
                    "INSERT INTO datetime_table
                      (test_case,         col_timestamp,             col_date,      col_datetime) VALUES
                      ('epoch',           1629865104000,             1629849600000, 1629865104000),
                      ('iso8601-ms',      '2021-08-25 04:18:24.111', null,          '2021-08-25 04:18:24.111'),
                      ('iso8601-no-ms',   '2021-08-25 04:18:24',     null,          '2021-08-25 04:18:24'),
                      ('iso8601-no-time', null,                      '2021-08-25',  null),
                      ('null',            null,                      null,          null);"]]
        (jdbc/execute! (sql-jdbc.conn/connection-details->spec :sqlite details)
                       [stmt]))
      (mt/with-temp [:model/Database db {:engine :sqlite :details (assoc details :dbname db-name)}]
        (sync/sync-database! db)
        ;; In SQLite, you can actually store any value in any date/timestamp column,
        ;; let's test only values we'd reasonably run into.
        ;; Caveat: TIMESTAMP stored as string doesn't get parsed and is returned as-is by the driver,
        ;;         some upper layer will handle it.
        (mt/with-db db
          (testing "select datetime stored as unix epoch"
            (is (= [["2021-08-25T04:18:24Z"   ; TIMESTAMP
                     "2021-08-25T00:00:00Z"   ; DATE
                     "2021-08-25T04:18:24Z"]] ; DATETIME
                   (mt/rows
                    (mt/run-mbql-query datetime_table
                      {:fields [$col_timestamp $col_date $col_datetime]
                       :filter [:= $test_case "epoch"]})))))
          (testing "select datetime stored as string with milliseconds"
            (is (= [["2021-08-25T04:18:24.111Z"   ; TIMESTAMP (raw string)
                     "2021-08-25T04:18:24.111Z"]] ; DATETIME
                   (mt/rows
                    (mt/run-mbql-query datetime_table
                      {:fields [$col_timestamp $col_datetime]
                       :filter [:= $test_case "iso8601-ms"]})))))
          (testing "select datetime stored as string without milliseconds"
            (is (= [["2021-08-25T04:18:24Z"   ; TIMESTAMP (raw string)
                     "2021-08-25T04:18:24Z"]] ; DATETIME
                   (mt/rows
                    (mt/run-mbql-query datetime_table
                      {:fields [$col_timestamp $col_datetime]
                       :filter [:= $test_case "iso8601-no-ms"]})))))
          (testing "select date stored as string without time"
            (is (= [["2021-08-25T00:00:00Z"]] ; DATE
                   (mt/rows
                    (mt/run-mbql-query datetime_table
                      {:fields [$col_date]
                       :filter [:= $test_case "iso8601-no-time"]})))))
          (testing "select NULL"
            (is (= [[nil nil nil]]
                   (mt/rows
                    (mt/run-mbql-query datetime_table
                      {:fields [$col_timestamp $col_date $col_datetime]
                       :filter [:= $test_case "null"]}))))))))))

(deftest ^:parallel duplicate-identifiers-test
  (testing "Make sure duplicate identifiers (even with different cases) get unique aliases"
    (mt/test-driver :sqlite
      (is (= '{:select   [source.CATEGORY AS CATEGORY
                          COUNT (*)         AS count]
               :from     [{:select [products.category || ? AS CATEGORY]
                           :from   [products]}
                          AS source]
               :group-by [source.CATEGORY]
               :order-by [source.CATEGORY ASC]
               :limit    [1]}
             (sql.qp-test-util/query->sql-map
              (mt/mbql-query products
                {:expressions {:CATEGORY [:concat $category "2"]}
                 :breakout    [:expression :CATEGORY]
                 :aggregation [:count]
                 :order-by    [[:asc [:expression :CATEGORY]]]
                 :limit       1})))))))

(deftest ^:parallel disallow-fdw-to-other-databases-test
  (testing "Don't allow connections to other SQLite databases with ATTACH DATABASE (https://github.com/metabase/metaboat/issues/152)"
    (mt/test-driver :sqlite
      ;; force creation of the sample dataset file
      (mt/dataset test-data
        (mt/id))
      (let [file (io/file "test-data.sqlite")
            path (.getAbsolutePath file)]
        (is (.exists file))
        (testing "Attach the sample dataset as an FDW called fdw_test"
          (testing "Detach it if it already exists from a previous test run"
            (u/ignore-exceptions
              (qp/process-query (mt/native-query {:query "DETACH DATABASE fdw_test;"}))))
          (testing "Attempting to attach it should fail"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"SQL error or missing database \(too many attached databases - max 0\)"
                 (qp/process-query (mt/native-query {:query (format "ATTACH DATABASE 'file:%s' as fdw_test;" path)}))))))
        (testing "Attempt to query the FDW -- shouldn't work"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"SQL error or missing database \(no such table: fdw_test\.products\)"
               (qp/process-query (mt/native-query {:query "SELECT count(*) FROM fdw_test.products;"})))))))))

(defn- load-extension-refusal!
  "The error SQLite gives when asked to load an extension that does not exist over a connection built from `details`
  to a temp database file: `not authorized` while extension loading is disabled, `no such file` once it tries to open
  the file."
  [details]
  (do-with-temp-sqlite-file!
   (fn [path]
     (let [spec (sql-jdbc.conn/connection-details->spec :sqlite (merge {:db path} details))]
       (try
         (jdbc/query spec ["SELECT load_extension('/nonexistent/metabase-test-extension')"])
         ::loaded
         (catch Exception e
           (re-find #"not authorized|no such file" (ex-message e))))))))

(deftest extension-loading-is-always-disabled-test
  (mt/with-premium-features #{}
    (testing "loading an extension runs native code in the Metabase process, so it is disabled whatever the details say"
      ;; detail keys reach the client as connection properties
      (doseq [details [{}
                       {:enable_load_extension true}
                       {:enable_load_extension "true"}
                       ;; a namespaced or differently-cased key names the same connection property once it reaches the
                       ;; client, and the JSON decoder keeps such keys
                       {:foo/enable_load_extension "true"}
                       {:ENABLE_LOAD_EXTENSION "true"}
                       {:foo/Enable_Load_Extension true}]]
        (testing (pr-str details)
          (is (= "not authorized" (load-extension-refusal! details)))))
      (testing "the client also reads settings from a database path's query, so such a path is refused outright"
        (doseq [db ["file:/tmp/x.db?enable_load_extension=true"
                    "file::memory:?ENABLE_LOAD_EXTENSION=true"
                    ":memory:?enable_load_extension=true"]]
          (testing db
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"SQLite database must be a file path or a file: URI"
                                  (sql-jdbc.conn/connection-details->spec :sqlite {:db db})))))))))

(deftest protected-connection-properties-cannot-be-overridden-test
  (mt/with-premium-features #{}
    (testing "properties the driver sets for safety survive a namespaced or differently-cased detail key"
      (doseq [[k v] [[:foo/limit_attached "10"]
                     [:LIMIT_ATTACHED "10"]
                     [:foo/enable_load_extension "true"]]]
        (let [spec (sql-jdbc.conn/connection-details->spec :sqlite {:db "/tmp/x.db" k v})]
          (testing (pr-str k)
            (is (= 0 (:limit_attached spec)))
            (is (= "false" (:enable_load_extension spec)))
            (is (= [] (->> (keys spec)
                           (filter #(re-find #"(?i)limit_attached|enable_load_extension" (name %)))
                           (remove #{:limit_attached :enable_load_extension}))))))))))

(deftest resource-urls-are-subject-to-the-network-policy-test
  ;; `:resource:<url>` has the client fetch the database file from that URL
  (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "external-only"]
    (testing "a resource URL naming an internal host is refused"
      (doseq [details [{:db ":resource:http://localhost/x.db"}
                       {:db ":resource:HTTP://127.0.0.1:8080/x.db"}
                       {:db ":resource:jar:http://localhost/x.jar!/x.db"}
                       ;; the SSH tunnel details mean nothing to a file-backed database, so they cannot swap the
                       ;; database's own hosts for the tunnel's
                       {:db ":resource:http://localhost/x.db" :tunnel-enabled true :tunnel-host "8.8.8.8"}
                       ;; `java.net.URL` ignores leading whitespace and a `url:` prefix, so the host it contacts is
                       ;; not the one a looser reading of the string would name
                       {:db ":resource: http://8.8.8.8;@127.0.0.1:8099/x.db"}
                       {:db ":resource:url:http://8.8.8.8;@127.0.0.1:8099/x.db"}
                       {:db ":RESOURCE:  url:http://127.0.0.1:8099/x.db"}
                       {:db ":resource:jar:url:http://127.0.0.1:8099/x.jar!/x.db"}
                       ;; a `file:` URL naming another machine is fetched from it
                       {:db ":resource:file://10.0.0.5/x.db"}
                       ;; the file check opens a plain URL in `:db` too, with or without tunnel details
                       {:db "http://127.0.0.1:8099/plain"}
                       {:db " http://127.0.0.1:8099/plain"}
                       {:db "http://127.0.0.1:8099/plain" :tunnel-enabled true :tunnel-host "8.8.8.8"}]]
        (testing (pr-str details)
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"private or internal network address"
                                (driver.u/validate-connection-hosts! :sqlite details))))))
    (testing "a local database file, or a resource that is not fetched over the network, names no host"
      (doseq [details [{:db "/tmp/x.db"}
                       {:db ":memory:"}
                       {:db ":resource:file:/tmp/x.db"}
                       {:db "file:/tmp/x.db?mode=ro"}]]
        (testing (pr-str details)
          (is (nil? (driver.u/validate-connection-hosts! :sqlite details))))))))
