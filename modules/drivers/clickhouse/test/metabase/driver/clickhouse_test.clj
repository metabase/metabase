(ns ^:mb/driver-tests metabase.driver.clickhouse-test
  "Tests for specific behavior of the ClickHouse driver."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.driver.clickhouse-test]}}}}}}
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.clickhouse :as clickhouse]
   [metabase.driver.clickhouse-qp :as clickhouse-qp]
   [metabase.driver.clickhouse-version :as clickhouse-version]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.card :as lib.card]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.test :as qp]
   [metabase.sync.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.clickhouse :as ctd]
   [metabase.upload.impl-test :as upload-test]
   [taoensso.nippy :as nippy]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (com.clickhouse.jdbc ConnectionImpl)
   (java.sql Connection)))

(set! *warn-on-reflection* true)

;; the mt/with-dynamic-redefs macro was renamed to mt/with-dynamic-fn-redefs for 0.53+
;; as 0.52 is still tested by CI we will check which macro is defined and use that
(defmacro with-dynamic-redefs [bindings & body]
  (if (resolve `mt/with-dynamic-redefs)
    `(mt/with-dynamic-redefs ~bindings ~@body)
    `(mt/with-dynamic-fn-redefs ~bindings ~@body)))

(deftest ^:parallel expr->columns-test
  (testing "splits a ClickHouse key expression into its top-level columns/expressions (no live DB needed)"
    ;; the catalog strings here are the real stored forms: `system.tables.sorting_key` is unwrapped, a single-expression
    ;; `system.data_skipping_indices.expr` is paren-wrapped, and a function key carries its own inner comma.
    (are [expr expected] (= expected (#'clickhouse/expr->columns expr))
      "a, b"                ["a" "b"]                  ; sorting key, no wrapper
      "(a, b)"              ["a" "b"]                  ; skip-index, wrapped
      "a"                   ["a"]
      "(lower(s))"          ["lower(s)"]               ; wrapped single expression, not truncated
      "a, cityHash64(s, b)" ["a" "cityHash64(s, b)"]   ; function key's inner comma is not a split point
      ;; a backtick-quoted name can hold a comma or paren; it must stay one column and come out bare
      "`weird,name`, b"     ["weird,name" "b"]
      "`paren(col`, b"      ["paren(col" "b"]
      "`back\\`tick`"       ["back`tick"]              ; a backtick in a quoted name is backslash-escaped
      "`back\\\\slash`"     ["back\\slash"]
      "`col\\`tick`, b"     ["col`tick" "b"]           ; the escaped backtick doesn't end the quoted span
      ""                    []                         ; blank -> [], so :key-columns stays schema-valid
      nil                   [])))

(defn- statement
  "Join `lines` into a `SHOW CREATE TABLE` statement, the way ClickHouse formats one."
  [& lines]
  (str/join "\n" lines))

(def ^:private every-skip-index-shape-statement
  "Skip-index line shapes: one column, several columns, an expression, a back-quoted name, a parameterised type, and
  an index literally named INDEX."
  (statement "CREATE TABLE tenant_a.t"
             "("
             "    `id` Nullable(UInt64),"
             "    `weird,name` Nullable(String),"
             "    `email` Nullable(String),"
             "    INDEX idx_id (id) TYPE minmax GRANULARITY 1,"
             "    INDEX idx_multi (id, `weird,name`) TYPE bloom_filter GRANULARITY 2,"
             "    INDEX idx_expr lower(email) TYPE bloom_filter GRANULARITY 1,"
             "    INDEX `odd name` (`weird,name`) TYPE minmax GRANULARITY 1,"
             "    INDEX idx_set (email) TYPE set(100) GRANULARITY 1,"
             "    INDEX INDEX (`weird,name`, email) TYPE minmax GRANULARITY 1"
             ")"
             "ENGINE = MergeTree"
             "ORDER BY (id)"
             "SETTINGS allow_nullable_key = 1, index_granularity = 8192"))

(def ^:private keyword-named-columns-statement
  "Columns named INDEX and TYPE, and a PRIMARY KEY line that differs from the sorting key."
  (statement "CREATE TABLE tenant_a.`odd table`"
             "("
             "    `INDEX` Int64,"
             "    `TYPE` String,"
             "    INDEX i1 (INDEX) TYPE minmax GRANULARITY 1"
             ")"
             "ENGINE = MergeTree"
             "PRIMARY KEY (INDEX)"
             "ORDER BY (INDEX, TYPE)"
             "SETTINGS index_granularity = 8192"))

(def ^:private unsorted-statement
  (statement "CREATE TABLE tenant_a.noidx"
             "("
             "    `a` Int64"
             ")"
             "ENGINE = MergeTree"
             "ORDER BY tuple()"
             "SETTINGS index_granularity = 8192"))

(def ^:private shared-merge-tree-statement
  "Metabase Cloud Storage's engine, captured from a tenant database on stats.metabase.com."
  (statement "CREATE TABLE db_c6633c128ed24e74.test_index"
             "("
             "    `session_id` String,"
             "    `event_type` UInt8,"
             "    `count` UInt64"
             ")"
             "ENGINE = SharedMergeTree('/clickhouse/tables/{uuid}/{shard}', '{replica}')"
             "ORDER BY (event_type, session_id)"
             "SETTINGS allow_nullable_key = 1, index_granularity = 8192"))

(def ^:private pre-26-statement
  "23.3 and 25.2 print a single-column index expression and PRIMARY KEY bare; 26.6+ wraps them in parentheses.
  Captured from 25.2.2.39."
  (statement "CREATE TABLE default.mb_probe_kw"
             "("
             "    `INDEX` Int64,"
             "    `TYPE` String,"
             "    `email` Nullable(String),"
             "    INDEX i1 INDEX TYPE minmax GRANULARITY 1,"
             "    INDEX i2 email TYPE bloom_filter GRANULARITY 3"
             ")"
             "ENGINE = MergeTree"
             "PRIMARY KEY INDEX"
             "ORDER BY (INDEX, TYPE)"
             "SETTINGS index_granularity = 8192"))

(def ^:private projection-statement
  "A projection carries its own, indented ORDER BY; the table's sorting key is one back-quoted column. Captured from
  25.2.2.39 (26.8 prints the index expression as `(b)`)."
  (statement "CREATE TABLE default.mb_probe_shapes"
             "("
             "    `a` Nullable(Int64),"
             "    `weird name` Nullable(String),"
             "    `b` String,"
             "    INDEX ng b TYPE ngrambf_v1(3, 256, 2, 0) GRANULARITY 1,"
             "    PROJECTION p1"
             "    ("
             "        SELECT"
             "            a,"
             "            b"
             "        ORDER BY b"
             "    )"
             ")"
             "ENGINE = MergeTree"
             "ORDER BY `weird name`"
             "SETTINGS allow_nullable_key = 1, index_granularity = 8192"))

(def ^:private escaped-names-statement
  "Names holding a backtick or a backslash are back-quoted with backslash escapes. Captured from 26.8.5."
  (statement "CREATE TABLE default.mb_probe_esc"
             "("
             "    `a` Int64,"
             "    `col\\`tick` Int64,"
             "    INDEX `ix\\`tick` (a) TYPE minmax GRANULARITY 1,"
             "    INDEX `ix\\\\back` (`col\\`tick`) TYPE minmax GRANULARITY 1,"
             "    INDEX `ix space` (a) TYPE minmax GRANULARITY 1"
             ")"
             "ENGINE = MergeTree"
             "ORDER BY `col\\`tick`"
             "SETTINGS index_granularity = 8192"))

(deftest ^:parallel create-table-statement->indexes-test
  (testing "every data-skipping INDEX line is parsed, in statement order (no live DB needed)"
    (let [idxs (#'clickhouse/create-table-statement->indexes every-skip-index-shape-statement)
          skip (filter #(= :skip-index (:kind %)) idxs)]
      (is (= ["idx_id" "idx_multi" "idx_expr" "odd name" "idx_set" "INDEX"]
             (map :name skip)))
      (is (= [["id"] ["id" "weird,name"] ["lower(email)"] ["weird,name"] ["email"] ["weird,name" "email"]]
             (map :key-columns skip)))
      (testing "the access method drops the type's arguments"
        (is (= ["minmax" "bloom_filter" "bloom_filter" "minmax" "set" "minmax"]
               (map :access-method skip))))
      (testing "the definition is the line itself, without indentation or the list separator"
        (is (= "INDEX idx_multi (id, `weird,name`) TYPE bloom_filter GRANULARITY 2"
               (:definition (second skip)))))
      (testing "the whole map matches the cross-driver shape"
        (is (= {:name              "idx_id"
                :kind              :skip-index
                :access-method     "minmax"
                :is-unique         false
                :is-primary        false
                :is-valid          true
                :key-columns       ["id"]
                :include-columns   []
                :partial-predicate nil
                :definition        "INDEX idx_id (id) TYPE minmax GRANULARITY 1"}
               (first skip))))))
  (testing "the sorting key is emitted as one unnamed :order-by entry"
    (is (= [{:name              nil
             :kind              :order-by
             :access-method     nil
             :is-unique         false
             :is-primary        false
             :is-valid          true
             :key-columns       ["id"]
             :include-columns   []
             :partial-predicate nil
             :definition        "ORDER BY (id)"}]
           (filter #(= :order-by (:kind %)) (#'clickhouse/create-table-statement->indexes
                                             every-skip-index-shape-statement)))))
  (testing "columns named INDEX/TYPE parse, and PRIMARY KEY is not mistaken for the sorting key"
    (is (=? [{:name "i1" :kind :skip-index :key-columns ["INDEX"]}
             {:name nil :kind :order-by :key-columns ["INDEX" "TYPE"]}]
            (#'clickhouse/create-table-statement->indexes keyword-named-columns-statement))))
  (testing "ORDER BY tuple() is an unsorted table: no entry, matching the empty catalog sorting key"
    (is (= [] (#'clickhouse/create-table-statement->indexes unsorted-statement)))))

(deftest ^:parallel create-table-statement->indexes-server-shapes-test
  (testing "a SharedMergeTree table with no skip index yields only its sorting key"
    (is (=? [{:name nil :kind :order-by :key-columns ["event_type" "session_id"]
              :definition "ORDER BY (event_type, session_id)"}]
            (#'clickhouse/create-table-statement->indexes shared-merge-tree-statement))))
  (testing "pre-26 servers print a single-column expression and PRIMARY KEY without parentheses"
    (is (=? [{:name "i1" :kind :skip-index :access-method "minmax" :key-columns ["INDEX"]
              :definition "INDEX i1 INDEX TYPE minmax GRANULARITY 1"}
             {:name "i2" :kind :skip-index :access-method "bloom_filter" :key-columns ["email"]}
             {:name nil :kind :order-by :key-columns ["INDEX" "TYPE"]}]
            (#'clickhouse/create-table-statement->indexes pre-26-statement))))
  (testing "a projection's indented ORDER BY is not the sorting key; a bare back-quoted single column is"
    (is (=? [{:name "ng" :kind :skip-index :access-method "ngrambf_v1" :key-columns ["b"]}
             {:name nil :kind :order-by :key-columns ["weird name"] :definition "ORDER BY `weird name`"}]
            (#'clickhouse/create-table-statement->indexes projection-statement))))
  (testing "back-quoted names come out with their backslash escapes undone, matching the managed side"
    (is (=? [{:name "ix`tick" :kind :skip-index :key-columns ["a"]}
             {:name "ix\\back" :kind :skip-index :key-columns ["col`tick"]}
             {:name "ix space" :kind :skip-index :key-columns ["a"]}
             {:name nil :kind :order-by :key-columns ["col`tick"]}]
            (#'clickhouse/create-table-statement->indexes escaped-names-statement)))))

(deftest ^:parallel table-missing-exception?-test
  (testing "the codes SHOW CREATE TABLE raises for a table or database that isn't there"
    (are [message] (#'clickhouse/table-missing-exception? (java.sql.SQLException. message))
      "Code: 60. DB::Exception: Table default.nope does not exist. (UNKNOWN_TABLE)"
      "Code: 81. DB::Exception: Database nope does not exist. (UNKNOWN_DATABASE)"
      "Code: 390. DB::Exception: Table `nope` doesn't exist. (CANNOT_GET_CREATE_TABLE_QUERY)"))
  (testing "a privilege error is not a missing table, so fetch-table-indexes rethrows it"
    (is (false? (#'clickhouse/table-missing-exception?
                 (java.sql.SQLException. "Code: 497. DB::Exception: Not enough privileges. (ACCESS_DENIED)"))))))

(deftest ^:parallel humanize-index-error-message-test
  (testing "the error code ends the useful part of a message; the version/queryId tail is dropped"
    (is (= (str "Code: 497. DB::Exception: user_x: Not enough privileges. To execute this query, it's necessary to "
                "have the grant SELECT ON system.data_skipping_indices. (ACCESS_DENIED)")
           (driver/humanize-index-error-message
            :clickhouse
            (str "Code: 497. DB::Exception: user_x: Not enough privileges. To execute this query, it's necessary to "
                 "have the grant SELECT ON system.data_skipping_indices. (ACCESS_DENIED) "
                 "(version 26.6.1.2047 (official build)) (queryId= 71d1c3e4-0000-0000-0000-000000000000)")))))
  (testing "a message with no such code is kept as-is"
    (is (= "Connection refused" (driver/humanize-index-error-message :clickhouse "Connection refused")))))

(deftest ^:parallel inline-value-string-test
  (testing "inlined string literals escape the backslash before the quote"
    ;; ClickHouse treats `\` as an escape character inside a string literal, so doubling `'` alone (the default
    ;; `[:sql String]` behaviour) lets a value like `a\'` close the literal early and run the rest as SQL.
    (are [s expected] (= expected (sql.qp/inline-value :clickhouse s))
      "Tito's Tacos"     "'Tito\\'s Tacos'"
      "back\\slash"      "'back\\\\slash'"
      "' OR 1 = 1 --"    "'\\' OR 1 = 1 --'"
      "a\\' OR 1 = 1 --" "'a\\\\\\' OR 1 = 1 --'")))

(def ^:private breakout-payload
  "A value that closes a ClickHouse string literal early unless its backslash is escaped: `a\\' or 1=1 -- `."
  "a\\' or 1=1 -- ")

(def ^:private escaped-breakout-payload
  "[[breakout-payload]] correctly escaped: `\\` is doubled, so the quote that follows is a genuinely escaped quote
  and the payload stays inside the literal."
  "a\\\\\\' or 1=1 -- ")

;;; `contains` / `starts-with` / `ends-with` are an additional carrier for the escaping defect above, and a
;;; very common one. On the generic SQL path they compile to `LIKE <pattern>`, and `sql.qp/generate-pattern` runs
;;; `escape-like-pattern` on the value first -- which doubles `\` and so happens to neutralise this payload shape.
;;; ClickHouse overrides all three to its native scalar functions instead, so `generate-pattern` never runs and the
;;; value reaches ordinary function-argument position unescaped. Only [[sql.qp/inline-value]] stands between it and
;;; the SQL text.
(deftest string-filter-inline-escaping-test
  ;; no ClickHouse server needed -- this only compiles the query -- but the QP pipeline reads the app DB
  (mt/initialize-if-needed! :db)
  (testing "a string filter value cannot break out of the literal when compiled with inline parameters"
    (let [mp       (lib.tu/merged-mock-metadata-provider
                    meta/metadata-provider
                    {:database {:engine       :clickhouse
                                :dbms-version {:version "24.4" :semantic-version {:major 24 :minor 4}}}})
          venues   (lib.metadata/table mp (meta/id :venues))
          name-col (lib.metadata/field mp (meta/id :venues :name))
          compile! (fn [filter-clause]
                     (:query (qp.compile/compile-with-inline-parameters
                              (-> (lib/query mp venues)
                                  (lib/filter filter-clause)))))]
      (doseq [[msg filter-clause expected]
              [["contains"                     (lib/contains name-col breakout-payload)
                (format "`positionUTF8`(`PUBLIC`.`VENUES`.`NAME`, '%s')" escaped-breakout-payload)]
               ["starts-with"                  (lib/starts-with name-col breakout-payload)
                (format "`startsWithUTF8`(`PUBLIC`.`VENUES`.`NAME`, '%s')" escaped-breakout-payload)]
               ["ends-with"                    (lib/ends-with name-col breakout-payload)
                (format "`endsWithUTF8`(`PUBLIC`.`VENUES`.`NAME`, '%s')" escaped-breakout-payload)]
               ["case-insensitive contains"    (lib/ignore-case (lib/contains name-col breakout-payload))
                (format "`positionCaseInsensitiveUTF8`(`PUBLIC`.`VENUES`.`NAME`, '%s')" escaped-breakout-payload)]
               ["case-insensitive starts-with" (lib/ignore-case (lib/starts-with name-col breakout-payload))
                (format "`lowerUTF8`('%s')" escaped-breakout-payload)]
               ["case-insensitive ends-with"   (lib/ignore-case (lib/ends-with name-col breakout-payload))
                (format "`lowerUTF8`('%s')" escaped-breakout-payload)]]]
        (testing msg
          (is (str/includes? (compile! filter-clause) expected)))))))

(deftest ^:parallel clickhouse-version
  (mt/test-driver :clickhouse
    (t2.with-temp/with-temp
      [:model/Database db
       {:engine  :clickhouse
        :details (mt/dbdef->connection-details :clickhouse :db {:database-name "default"})}]
      (let [version (driver/dbms-version :clickhouse db)]
        (is (number? (get-in version [:semantic-version :major])))
        (is (number? (get-in version [:semantic-version :minor])))
        (is (string? (get    version :version)))))))

(deftest ^:parallel clickhouse-server-timezone
  (mt/test-driver :clickhouse
    (is (= "UTC"
           (let [details (mt/dbdef->connection-details :clickhouse :db {:database-name "default"})
                 spec    (sql-jdbc.conn/connection-details->spec :clickhouse details)]
             (driver/db-default-timezone :clickhouse spec))))))

(deftest clickhouse-report-timezone-reaches-server-test
  ;; Regression for #79671.
  (mt/test-driver :clickhouse
    (mt/with-report-timezone-id! "America/Santiago"
      (is (= [["America/Santiago" "America/Santiago"]]
             (->> "SELECT timezone() AS tz, getSetting('session_timezone') AS s"
                  (lib/native-query (mt/metadata-provider))
                  qp/process-query
                  mt/rows))))))

(deftest ^:synchronized clickhouse-session-timezone-does-not-leak-across-borrows-test
  (mt/test-driver :clickhouse
    (sql-jdbc.conn/invalidate-pool-for-db! (mt/db))
    (let [underlying-conn-ids (atom [])
          observe (fn [opts]
                    (sql-jdbc.execute/do-with-connection-with-options
                     :clickhouse (mt/id) opts
                     (fn [^Connection conn]
                       (swap! underlying-conn-ids conj
                              (System/identityHashCode (.unwrap conn ConnectionImpl)))
                       (with-open [stmt (.createStatement conn)
                                   rs   (.executeQuery stmt "SELECT getSetting('session_timezone')")]
                         (.next rs)
                         (.getString rs 1)))))]
      (is (= "America/Santiago" (observe {:session-timezone "America/Santiago"})))
      (let [result (observe nil)]
        ;; Guard: the leak is only observable when the pool hands us the same underlying
        ;; ConnectionImpl. With a freshly invalidated pool and back-to-back borrows this holds;
        ;; if it stops holding, the test has to be fixed.
        (is (apply = @underlying-conn-ids)
            (str "expected both borrows to reuse the same underlying connection: " @underlying-conn-ids))
        (is (= "" result)
            "a borrow without :session-timezone must not inherit the previous borrow's timezone")))))

(deftest ^:parallel clickhouse-connection-string
  (testing "connection with no additional options"
    (is (= ctd/default-connection-params
           (sql-jdbc.conn/connection-details->spec
            :clickhouse
            {}))))
  (testing "custom connection with additional options"
    (is (= (merge
            ctd/default-connection-params
            {:subname "//myclickhouse:9999/foo?sessionTimeout=42"
             :user "bob"
             :password "qaz"
             :ssl true
             :custom_http_params "select_sequential_consistency=1,max_threads=42,allow_experimental_analyzer=0"})
           (sql-jdbc.conn/connection-details->spec
            :clickhouse
            {:host "myclickhouse"
             :port 9999
             :user "bob"
             :password "qaz"
             :dbname "foo"
             :additional-options "sessionTimeout=42"
             :ssl true
             :clickhouse-settings "max_threads=42,allow_experimental_analyzer=0"}))))
  (testing "nil dbname handling"
    (is (= ctd/default-connection-params
           (sql-jdbc.conn/connection-details->spec
            :clickhouse {:dbname nil}))))
  (testing "schema removal"
    (doall
     (for [host ["localhost" "http://localhost" "https://localhost"]]
       (testing (str "for host " host)
         (is (= ctd/default-connection-params
                (sql-jdbc.conn/connection-details->spec
                 :clickhouse {:host host}))))))
    (doall
     (for [host ["myhost" "http://myhost" "https://myhost"]]
       (testing (str "for host " host)
         (is (= (merge ctd/default-connection-params
                       {:subname "//myhost:8123/default"})
                (sql-jdbc.conn/connection-details->spec
                 :clickhouse {:host host}))))))
    (doall
     (for [host ["sub.example.com" "http://sub.example.com" "https://sub.example.com"]]
       (testing (str "for host " host " with some additional params")
         (is (= (merge ctd/default-connection-params
                       {:subname "//sub.example.com:8443/mydb" :ssl true})
                (sql-jdbc.conn/connection-details->spec
                 :clickhouse {:host host :dbname "mydb" :port 8443 :ssl true}))))))))

(deftest ^:parallel clickhouse-connection-string-select-sequential-consistency
  (testing "connection with no additional options"
    (is (= ctd/default-connection-params
           (sql-jdbc.conn/connection-details->spec
            :clickhouse
            {})))))

(deftest ^:parallel clickhouse-tls
  (mt/test-driver :clickhouse
    (let [working-dir (System/getProperty "user.dir")
          cert-path (str working-dir "/modules/drivers/clickhouse/.docker/clickhouse/single_node_tls/certificates/ca.crt")
          additional-options (str "sslrootcert=" cert-path)]
      (testing "simple connection with a single database"
        (is (= "UTC"
               (driver/db-default-timezone
                :clickhouse
                (sql-jdbc.conn/connection-details->spec
                 :clickhouse
                 {:ssl true
                  :host "server.clickhouseconnect.test"
                  :port 8443
                  :additional-options additional-options})))))
      (testing "connection with multiple databases"
        (is (= "UTC"
               (driver/db-default-timezone
                :clickhouse
                (sql-jdbc.conn/connection-details->spec
                 :clickhouse
                 {:ssl true
                  :host "server.clickhouseconnect.test"
                  :port 8443
                  :enable-multiple-db true
                  :db-filters-patterns "default, system"
                  :db-filters-type "inclusion"
                  :additional-options additional-options}))))))))

(deftest ^:parallel clickhouse-nippy
  (mt/test-driver :clickhouse
    (testing "UnsignedByte"
      (let [value (com.clickhouse.data.value.UnsignedByte/valueOf "214")]
        (is (= value (nippy/thaw (nippy/freeze value))))))
    (testing "UnsignedShort"
      (let [value (com.clickhouse.data.value.UnsignedShort/valueOf "62055")]
        (is (= value (nippy/thaw (nippy/freeze value))))))
    (testing "UnsignedInteger"
      (let [value (com.clickhouse.data.value.UnsignedInteger/valueOf "4748364")]
        (is (= value (nippy/thaw (nippy/freeze value))))))
    (testing "UnsignedLong"
      (let [value (com.clickhouse.data.value.UnsignedLong/valueOf "84467440737095")]
        (is (= value (nippy/thaw (nippy/freeze value))))))))

(deftest ^:parallel clickhouse-query-formatting
  (mt/test-driver :clickhouse
    (let [query             (mt/mbql-query venues {:fields [$id] :order-by [[:asc $id]] :limit 5})
          {compiled :query} (qp.compile/compile-with-inline-parameters query)
          pretty            (driver/prettify-native-form :clickhouse compiled)]
      (testing "compiled"
        (is (= "SELECT `test_data`.`venues`.`id` AS `id` FROM `test_data`.`venues` ORDER BY `test_data`.`venues`.`id` ASC LIMIT 5" compiled)))
      (testing "pretty"
        (is (= "SELECT\n  `test_data`.`venues`.`id` AS `id`\nFROM\n  `test_data`.`venues`\nORDER BY\n  `test_data`.`venues`.`id` ASC\nLIMIT\n  5" pretty))))))

(deftest ^:parallel clickhouse-can-connect
  (mt/test-driver :clickhouse
    (doall
     (for [[username password] [["default" ""] ["user_with_password" "foo@bar!"]]
           database            ["default" "Special@Characters~"]]
       (testing (format "User `%s` can connect to `%s` with `%s`" username database password)
         (let [details (merge {:user username :password password}
                              (mt/dbdef->connection-details :clickhouse :db {:database-name database}))]
           (is (true? (driver/can-connect? :clickhouse details)))))))))

(deftest ^:parallel clickhouse-additional-options-test
  (testing "additional options not prefixed with `clickhouse_setting_` are moved to custom_http_params (#70777)"
    (mt/test-driver :clickhouse
      (let [details (assoc (:details (mt/db))
                           :additional-options "clickhouse_setting_max_threads=5&max_block_size=50"
                           :clickhouse-settings "max_result_rows=10,max_columns_to_read=20")
            spec   (sql-jdbc.conn/connection-details->spec :clickhouse details)]
        (is (true? (driver/can-connect? :clickhouse details)))
        (is (= "//localhost:8123/default?clickhouse_setting_max_threads=5&max_block_size=50"
               (:subname spec)))
        (is (= "select_sequential_consistency=1,max_result_rows=10,max_columns_to_read=20"
               (:custom_http_params spec)))
        (is (= {:max_threads 5
                :max_block_size 65409 ;; unknown key is ignored
                :max_results_rows 10
                :max_columns_to_read 20}
               (->> ["SELECT getSetting('max_threads') as max_threads,
                             getSetting('max_block_size') as max_block_size,
                             getSetting('max_result_rows') as max_results_rows,
                             getSetting('max_columns_to_read') as max_columns_to_read;"]
                    (jdbc/query spec)
                    first)))))))

(deftest clickhouse-qp-extract-datetime-timezone
  (mt/test-driver :clickhouse
    (is (= "utc" (#'clickhouse-qp/extract-datetime-timezone "datetime('utc')")))
    (is (= "utc" (#'clickhouse-qp/extract-datetime-timezone "datetime64(3, 'utc')")))
    (is (= "europe/amsterdam" (#'clickhouse-qp/extract-datetime-timezone "datetime('europe/amsterdam')")))
    (is (= "europe/amsterdam" (#'clickhouse-qp/extract-datetime-timezone "datetime64(9, 'europe/amsterdam')")))
    (is (= nil (#'clickhouse-qp/extract-datetime-timezone "datetime")))
    (is (= nil (#'clickhouse-qp/extract-datetime-timezone "datetime64")))
    (is (= nil (#'clickhouse-qp/extract-datetime-timezone "datetime64(3)")))))

(deftest ^:synchronized clickhouse-insert
  (mt/test-driver :clickhouse
    (t2.with-temp/with-temp
      [:model/Database db
       {:engine  :clickhouse
        :details (mt/dbdef->connection-details :clickhouse :db {:database-name "default"})}]
      (let [table (keyword (format "insert_table_%s" (System/currentTimeMillis)))]
        (driver/create-table! :clickhouse (:id db) table {:id "Int64", :name "String"})
        (try
          (driver/insert-into! :clickhouse (:id db) table [:id :name] [[42 "Bob"] [43 "Alice"]])
          (is (= #{{:id 42, :name "Bob"}
                   {:id 43, :name "Alice"}}
                 (set (sql-jdbc/query :clickhouse db {:select [:*] :from [table]}))))
          (finally
            (driver/drop-table! :clickhouse (:id db) table)))))))

(deftest ^:parallel percentile-test
  (mt/test-driver
    :clickhouse
    (testing "Percentile with expression arg works correctly (#56485)"
      (let [mp (mt/metadata-provider)
            q (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                  (lib/breakout (lib/with-temporal-bucket (lib.metadata/field mp (mt/id :orders :created_at)) :month))
                  (lib/aggregate (lib/percentile (lib/case [[(lib/< (lib.metadata/field mp (mt/id :orders :created_at))
                                                                    "2018-04-01")
                                                             (lib.metadata/field mp (mt/id :orders :total))]])
                                                 0.7))
                  (lib/limit 3))]
        (is (= [["2016-04-01T00:00:00Z" 52.76]
                ["2016-05-01T00:00:00Z" 81.892]
                ["2016-06-01T00:00:00Z" 71.954]]
               (mt/rows (qp/process-query q))))))))

(deftest ^:parallel comment-question-mark-test
  (mt/test-driver :clickhouse
    (testing "a query with a question mark in the comment and has a variable should work correctly (#56690)"
      (let [query "SELECT *
                   -- ?
                   FROM test_data.categories
                   WHERE test_data.categories.name = {{category_name}};"]
        (is (= [[1 "African"]]
               (mt/rows
                (qp/process-query
                 {:database (mt/id)
                  :type :native
                  :native {:query query
                           :template-tags {"category_name" {:type         :text
                                                            :name         "category_name"
                                                            :display-name "Category Name"}}}
                  :parameters [{:type   :category
                                :target [:variable [:template-tag "category_name"]]
                                :value  "African"}]}))))))))

(deftest ^:parallel select-question-mark-test
  (mt/test-driver :clickhouse
    (testing "a query that selects a question mark and has a variable should work correctly (#56690)"
      (let [query "SELECT *, '?'
                   FROM test_data.categories
                   WHERE {{category_name}};"]
        (is (= [[1 "African" "?"]]
               (mt/rows
                (qp/process-query
                 {:database (mt/id)
                  :type :native
                  :native {:query query
                           :template-tags {"category_name" {:name         "category_name"
                                                            :display_name "Category Name"
                                                            :type         "dimension"
                                                            :widget-type  "string/contains"
                                                            :options {:case-sensitive false}
                                                            :dimension    [:field (mt/id :categories :name) nil]}}}
                  :parameters [{:options {:case-sensitive false}
                                :type   :string/contains
                                :target [:dimension [:template-tag "category_name"]]
                                :value  ["African"]}]}))))))))

(deftest ^:parallel ternary-with-variable-test
  (mt/test-driver :clickhouse
    (testing "a query with a ternary and a variable should work correctly (#56690)"
      (is (= [[1 "African" 1]]
             (mt/rows
              (qp/process-query
               {:database (mt/id)
                :type :native
                :native {:query "SELECT *, true ? 1 : 0 AS foo
                                 FROM test_data.categories
                                 WHERE name = {{category_name}};"
                         :template-tags {"category_name" {:type         :text
                                                          :name         "category_name"
                                                          :display-name "Category Name"}}}
                :parameters [{:type   :category
                              :target [:variable [:template-tag "category_name"]]
                              :value  "African"}]})))))))

(deftest ^:parallel line-comment-block-comment-test
  (mt/test-driver :clickhouse
    (testing "a query with a line comment followed by a block comment should work correctly (#57149, #62741)"
      (is (= [[1]]
             (mt/rows
              (qp/process-query
               (mt/native-query
                {:query "-- foo
                         /* comment */
                         select 1;"}))))))))

(deftest ^:parallel subquery-with-cte-test
  (mt/test-driver :clickhouse
    (testing "a query with a CTE in a subquery should work correctly"
      (is (= [[9]]
             (mt/rows
              (qp/process-query
               (mt/native-query
                {:query "select * from ( with x as ( select 9 ) select * from x ) as y;"}))))))))

(deftest ^:parallel casted-params-test
  (mt/test-driver :clickhouse
    (testing "a query with a with multiple params and one of the casted should work correctly"
      (is (= [[1 "African"] [2 "American"]]
             (mt/rows
              (qp/process-query
               {:database   (mt/id)
                :type       :native
                :native     {:query         "SELECT *
                                             FROM `test_data`.`categories`
                                             WHERE id = {{category_id_1}}::String or id = {{category_id_2}}"
                             :template-tags {"category_id_1" {:type         :number
                                                              :name         "category_id_1"
                                                              :display-name "Category Id 1"}
                                             "category_id_2" {:type         :text
                                                              :name         "category_id_2"
                                                              :display-name "Category Id 2"}}}
                :parameters [{:type   :number/=
                              :target [:variable [:template-tag "category_id_1"]]
                              :value  ["1"]}
                             {:type   :category
                              :target [:variable [:template-tag "category_id_2"]]
                              :value  "2"}]
                :middleware {:format-rows? false}})))))))

(deftest ^:parallel compile-transform-test
  (mt/test-driver :clickhouse
    (testing "compile-transform for clickhouse with empty primary key column"
      (is (= ["CREATE TABLE `PRODUCTS_COPY` ORDER BY () AS SELECT * FROM products" nil]
             (driver/compile-transform :clickhouse {:query {:query "SELECT * FROM products"}
                                                    :output-table "PRODUCTS_COPY"}))))
    (testing "compile-insert generates INSERT INTO"
      (is (= ["INSERT INTO `PRODUCTS_COPY` SELECT * FROM products" nil]
             (driver/compile-insert :clickhouse {:query {:query "SELECT * FROM products"}
                                                 :output-table "PRODUCTS_COPY"}))))))

(deftest ^:parallel clickhouse-db-supports-schemas-test
  (doseq [details [{}
                   {:enable-multiple-db nil}
                   {:enable-multiple-db false}
                   {:enable-multiple-db true}]]
    ;; clickhouse will always use schemas after reversions in 65984 and 68517
    (is (true? (driver/database-supports? :clickhouse :schemas {:details details})))))

(deftest ^:parallel humanize-connection-error-message-test
  (is (= "random message" (driver/humanize-connection-error-message :clickhouse ["random message"])))
  (is (= :username-or-password-incorrect (driver/humanize-connection-error-message :clickhouse ["Failed to create connection"
                                                                                                "Failed to get server info"
                                                                                                "Code: 516. DB::Exception: asdf: Authentication failed: password is incorrect, or there is no user with such name. (AUTHENTICATION_FAILED) (version 25.7.4.11 (official build))"]))))

;; Dataset for testing reserved SQL keyword as table name (#68423)
;; The table name "transaction" is a SQL keyword that causes parsing issues with JDBC driver 0.9.5
(mt/defdataset reserved-keyword-table-name
  [["transaction"
    [{:field-name "event_id", :base-type :type/Integer}
     {:field-name "event_name", :base-type :type/Text}
     {:field-name "amount", :base-type :type/Float}]
    [[1 "purchase" 99.99]
     [2 "refund" -25.00]
     [3 "purchase" 149.50]]]])

(deftest ^:parallel reserved-keyword-table-name-native-query-test
  (mt/test-driver :clickhouse
    (testing "native query against a table named 'transaction' (SQL keyword) should work (#68423)"
      (mt/dataset reserved-keyword-table-name
        (let [db-name (-> (mt/db) :details :db)
              results (qp/process-query
                       (mt/native-query
                        {:query (format "SELECT * FROM %s.transaction" db-name)}))]
          (is (= [[1 1 "purchase" 99.99]
                  [2 2 "refund" -25.0]
                  [3 3 "purchase" 149.5]]
                 (mt/rows results))))))))

(deftest ^:parallel uploads-supported-test
  (mt/test-driver :clickhouse
    (is (false? (driver/database-supports? driver/*driver* :uploads (mt/db))))
    (is (true? (driver/database-supports? driver/*driver* :uploads (assoc-in (mt/db) [:dbms-version :cloud] true))))
    (is (true? (driver/database-supports? driver/*driver* :uploads (assoc-in (mt/db) [:dbms_version :cloud] true))))))

(deftest ^:synchronized csv-upload-and-sync-test
  (testing "ClickHouse CSV uploads work correctly when cloud mode is enabled"
    (mt/test-driver :clickhouse
      (mt/with-dynamic-fn-redefs [clickhouse-version/dbms-version (constantly {:cloud true
                                                                               :version "24.8.1"
                                                                               :semantic-version {:major 24 :minor 8}})]
        (let [details   (-> (mt/dbdef->connection-details :clickhouse :db {:database-name "uploads_schema"})
                            (assoc :enable-multiple-db false))
              conn-spec (sql-jdbc.conn/connection-details->spec :clickhouse details)]
          (driver/create-schema-if-needed! :clickhouse conn-spec "uploads_schema")
          (try
            (mt/with-temp [:model/Database db {:engine  :clickhouse
                                               :details details}]
              (is (true? (driver/database-supports? :clickhouse :uploads db)))
              (testing "an upload schema is required"
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"A schema has not been set."
                     (upload-test/do-with-uploaded-example-csv!
                      {:db-id (:id db)
                       :auxiliary-sync-steps :synchronous
                       :schema-name ""}
                      identity))))
              (testing "upload models work after sync"
                (upload-test/do-with-uploaded-example-csv!
                 {:db-id (:id db)
                  :auxiliary-sync-steps :synchronous
                  :schema-name "uploads_schema"}
                 (fn [model]
                   (let [query-model (fn []
                                       (let [mp   (lib-be/application-database-metadata-provider (:id db))
                                             card (lib.metadata/card mp (:id model))]
                                         (->> (lib/query mp card)
                                              (qp/process-query)
                                              (mt/formatted-rows [int str]))))]
                     (is (= [[1 " Luke Skywalker"]
                             [2 " Darth Vader"]]
                            (query-model)))
                     (sync/sync-database! db {:scan :schema})
                     (is (= [[1 " Luke Skywalker"]
                             [2 " Darth Vader"]]
                            (query-model))))))))
            (finally
              (jdbc/execute! conn-spec ["DROP DATABASE IF EXISTS `uploads_schema`"]))))))))

(deftest ^:parallel type->database-type-test
  (testing "type->database-type multimethod returns correct ClickHouse types"
    (are [base-type expected] (= expected (driver/type->database-type :clickhouse base-type))
      :type/Boolean            [[:raw "Nullable(Boolean)"]]
      :type/Float              [[:raw "Nullable(Float64)"]]
      :type/Integer            [[:raw "Nullable(Int32)"]]
      :type/Number             [[:raw "Nullable(Int64)"]]
      :type/Text               [[:raw "Nullable(String)"]]
      :type/TextLike           [[:raw "Nullable(String)"]]
      :type/Date               [[:raw "Nullable(Date32)"]]
      :type/DateTime           [[:raw "Nullable(DateTime64(3))"]]
      :type/DateTimeWithTZ     [[:raw "Nullable(DateTime64(3, 'UTC'))"]])))

(deftest ^:parallel query-with-cte-subquery-and-param-test
  (mt/test-driver :clickhouse
    (testing "a query with a CTE in a subquery and a parameter should work correctly"
      (is (= [[1 "abc"]]
             (mt/rows
              (qp/process-query
               {:database (mt/id)
                :type :native
                :native {:query "SELECT id, val FROM ( WITH foo AS ( SELECT 1 id, 'abc' val ) SELECT * FROM foo ) WHERE val = {{val}} LIMIT 1048575"
                         :template-tags {"val" {:type :text
                                                :name "val"
                                                :display-name "Val"}}}
                :parameters [{:type "string/="
                              :target [:variable [:template-tag "val"]]
                              :value ["abc"]}]})))))))

(deftest ^:parallel native-query-cte-filtering-test
  (mt/test-driver :clickhouse
    (testing "can filter on a saved native query with a CTE (#63635)"
      (let [native-query (mt/native-query
                          {:query "with base as (select 1 id, 'abc' val) select * from base"})
            card-data    (mt/card-with-source-metadata-for-query native-query)]
        (mt/with-temp [:model/Card {card-id :id} card-data]
          (let [mp       (mt/metadata-provider)
                card-mp  (lib.metadata/card mp card-id)
                val-col  (some #(when (= "val" (:name %)) %)
                               (lib.card/card-returned-columns mp card-mp))]
            (is (= [[1 "abc"]]
                   (-> (lib/query mp card-mp)
                       (lib/filter (lib/= val-col "abc"))
                       (qp/process-query)
                       (mt/rows))))))))))

(deftest ^:parallel recursive-cte-native-query-test
  (mt/test-driver :clickhouse
    (testing "can execute a native query with a recursive CTE (#73161)"
      (is (= [[1] [2] [3]]
             (->> "WITH RECURSIVE t AS ( SELECT 1 AS n UNION ALL SELECT n + 1 FROM t WHERE n < 3 ) SELECT * FROM t;"
                  (lib/native-query (mt/metadata-provider))
                  (qp/process-query)
                  (mt/formatted-rows [int])))))))

(deftest ^:parallel query-with-boolean-setting-test
  (mt/test-driver :clickhouse
    (testing "can execute a query with settings set to a boolean (#73431)"
      (is (= [[2]]
             (->> "select 2 SETTINGS use_query_cache = true"
                  (lib/native-query (mt/metadata-provider))
                  (qp/process-query)
                  (mt/rows)))))))

(defn- check-legacy-dbname [dbname exp-name]
  (let [details (assoc (:details (mt/db)) :dbname dbname)
        spec    (sql-jdbc.conn/connection-details->spec :clickhouse details)]
    (is (true? (driver/can-connect? :clickhouse details)))
    (is (= (format "//localhost:8123/%s" exp-name)
           (:subname spec)))))

(deftest ^:parallel handle-db-names-with-spaces-test
  (mt/test-driver :clickhouse
    (are [dbname exp-name] (check-legacy-dbname dbname exp-name)
      "test_data default fake_db" "test_data"
      "test_data"                 "test_data"
      ""                          ""
      nil                         "default")))

(deftest ^:parallel handle-db-names-with-commas-test
  (mt/test-driver :clickhouse
    (are [dbname exp-name] (check-legacy-dbname dbname exp-name)
      "test_data, fake_db" "test_data"
      "test_data,fake_db"  "test_data"
      "test_data,"         "test_data")))

;; TODO (lbrdnk 2026-01-23): Excplicit exceptions from [[metabase.driver.util/parsed-query]] are shutdown
;;                           at the moment to avoid potential log flooding. We should revisit this during further
;;                           parsing work.
#_(deftest ^:parallel parse-final-identifier-test
    (mt/test-driver
      :clickhouse
      (testing "`final` is not allowed as identifier on Clickhouse, parsing fails with an exception"
        (mt/with-temp [:model/Database db {:engine "clickhouse"
                                           :name "final"
                                           :initial_sync_status "complete"}]
          (mt/with-db
            db
            (let [mp (mt/metadata-provider)
                  broken-query (lib/native-query mp "select final from final")]
              (is (thrown-with-msg? Exception #"SQL parsing failed."
                                    (driver/native-query-deps :clickhouse broken-query)))
              (is (thrown-with-msg? Exception #"SQL parsing failed."
                                    (driver/native-result-metadata :clickhouse broken-query)))
              (is (thrown-with-msg? Exception #"SQL parsing failed."
                                    (driver/validate-native-query-fields :clickhouse broken-query)))))))))

(deftest ^:parallel set-role-statement-quotes-role-test
  (are [role sql] (= sql
                     (sql-jdbc/set-role-statement :clickhouse nil role))
    ;; the whole role is quoted as a single identifier
    "x"                             "SET ROLE \"x\""
    ;; a comma is part of the role name, not a separator between roles
    "x,y"                           "SET ROLE \"x,y\""
    "a,b"                           "SET ROLE \"a,b\""
    ;; an already-quoted value is left as-is
    "\"x\""                         "SET ROLE \"x\""
    ;; default database role is emitted verbatim, not quoted
    "NONE"                          "SET ROLE NONE"
    ;; interior double-quotes are doubled
    "x\"; SELECT sleep(10); --"     "SET ROLE \"x\"\"; SELECT sleep(10); --\""
    "\"x\"; SELECT sleep(10); --\"" "SET ROLE \"x\"\"; SELECT sleep(10); --\""
    ;; a trailing backslash is escaped so it cannot close the quoted identifier
    "foo\\"                         "SET ROLE \"foo\\\\\""
    "a\\\"b"                        "SET ROLE \"a\\\\\"\"b\""
    ;; a lone double-quote is a one-character role name, not an already-quoted empty one -- it must still come
    ;; out as a terminated identifier
    "\""                            "SET ROLE \"\"\"\""))
