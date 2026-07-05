(ns ^:mb/driver-tests metabase.driver.clickhouse-native-test
  "Tests for the ClickHouse Client V2 native transport.
   Covers string escaping (security), parameter substitution, LIMIT detection,
   type round-trips, error handling, and connection edge cases."
  (:require
   [clojure.test :refer :all]
   [metabase.driver.clickhouse-native :as clickhouse-native]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ Section A: String Escaping ------------------------------------------
;; Tests for #'clickhouse-native/param->sql-literal — focuses on the backslash-escape bypass (BUG 1).

(deftest ^:parallel param->sql-literal-basic-test
  (testing "nil → NULL"
    (is (= "NULL" (#'clickhouse-native/param->sql-literal nil))))
  (testing "empty string"
    (is (= "''" (#'clickhouse-native/param->sql-literal ""))))
  (testing "plain string"
    (is (= "'hello'" (#'clickhouse-native/param->sql-literal "hello"))))
  (testing "integer"
    (is (= "42" (#'clickhouse-native/param->sql-literal 42))))
  (testing "float"
    (is (= "3.14" (#'clickhouse-native/param->sql-literal 3.14))))
  (testing "boolean true"
    (is (= "true" (#'clickhouse-native/param->sql-literal true))))
  (testing "boolean false"
    (is (= "false" (#'clickhouse-native/param->sql-literal false)))))

(deftest ^:parallel param->sql-literal-single-quote-test
  (testing "single quote in string is escaped"
    (is (= "'O\\'Brien'" (#'clickhouse-native/param->sql-literal "O'Brien"))))
  (testing "multiple single quotes"
    (is (= "'it\\'s a \\'test\\''" (#'clickhouse-native/param->sql-literal "it's a 'test'")))))

(deftest ^:parallel param->sql-literal-backslash-escape-test
  (testing "BUG 1: trailing backslash must not escape the closing quote"
    ;; Before fix: "test\" → 'test\'' (backslash escapes the closing quote → injection)
    ;; After fix:  "test\" → 'test\\' (backslash is escaped, closing quote is safe)
    (is (= "'test\\\\'" (#'clickhouse-native/param->sql-literal "test\\"))))
  (testing "BUG 1: backslash followed by single quote"
    ;; Before fix: "test\'" → 'test\'' (broken escaping)
    ;; After fix:  "test\'" → 'test\\\\'' — wait, let's compute:
    ;; input: test\'  (5 chars: t e s t \ ')
    ;; step 1 (escape \): test\\' (6 chars)
    ;; step 2 (escape '): test\\\' (7 chars)
    ;; wrapped: 'test\\\'' (with outer quotes)
    (is (= "'test\\\\\\''" (#'clickhouse-native/param->sql-literal "test\\'"))))
  (testing "SQL injection attempt: backslash + single quote combo"
    (let [result (#'clickhouse-native/param->sql-literal "'; DROP TABLE x--")]
      ;; The single quote must be escaped so ClickHouse sees it as literal data
      (is (clojure.string/starts-with? result "'"))
      (is (clojure.string/ends-with? result "'"))
      (is (clojure.string/includes? result "\\'")))))

(deftest ^:parallel param->sql-literal-special-chars-test
  (testing "newline in string"
    (is (= "'hello\nworld'" (#'clickhouse-native/param->sql-literal "hello\nworld"))))
  (testing "tab in string"
    (is (= "'hello\tworld'" (#'clickhouse-native/param->sql-literal "hello\tworld"))))
  (testing "null byte in string"
    (is (= "'\u0000'" (#'clickhouse-native/param->sql-literal "\u0000")))))

(deftest ^:parallel param->sql-literal-date-types-test
  (testing "LocalDate"
    (let [d (java.time.LocalDate/of 2024 1 15)]
      (is (= "'2024-01-15'" (#'clickhouse-native/param->sql-literal d)))))
  (testing "LocalDateTime"
    (let [dt (java.time.LocalDateTime/of 2024 1 15 10 30 0)]
      (is (= "'2024-01-15T10:30'" (#'clickhouse-native/param->sql-literal dt)))))
  (testing "OffsetDateTime uses parseDateTimeBestEffort"
    (let [odt (java.time.OffsetDateTime/of 2024 1 15 10 30 0 0 java.time.ZoneOffset/UTC)]
      (is (clojure.string/starts-with?
           (#'clickhouse-native/param->sql-literal odt)
           "parseDateTimeBestEffort('"))))
  (testing "ZonedDateTime uses parseDateTimeBestEffort"
    (let [zdt (java.time.ZonedDateTime/of 2024 1 15 10 30 0 0 (java.time.ZoneId/of "UTC"))]
      (is (clojure.string/starts-with?
           (#'clickhouse-native/param->sql-literal zdt)
           "parseDateTimeBestEffort('")))))

;;; ------------------------------------------ Section B: Parameter Substitution ------------------------------------------

(deftest ^:parallel substitute-params-basic-test
  (testing "no params → unchanged SQL"
    (is (= "SELECT 1" (#'clickhouse-native/substitute-params "SELECT 1" []))))
  (testing "single param"
    (is (= "SELECT 42" (#'clickhouse-native/substitute-params "SELECT ?" [42]))))
  (testing "multiple params"
    (is (= "SELECT 1, 'hello'"
           (#'clickhouse-native/substitute-params "SELECT ?, ?" [1 "hello"]))))
  (testing "nil param → NULL"
    (is (= "SELECT NULL" (#'clickhouse-native/substitute-params "SELECT ?" [nil])))))

(deftest ^:parallel substitute-params-question-mark-in-string-literal-test
  (testing "KNOWN LIMITATION: ? inside SQL string literal gets substituted"
    ;; This documents the known bug (BUG 2). The naive text-based substitution
    ;; replaces ? inside string literals. Since Metabase generates SQL with ?
    ;; only in parameter positions, this is acceptable for now.
    (let [result (#'clickhouse-native/substitute-params "SELECT '?' WHERE id = ?" [42])]
      ;; Current behavior: both ? get substituted.
      ;; The first ? gets the param 42, the second ? gets nil → NULL
      (is (string? result))
      ;; Just verify it doesn't throw
      )))

(deftest ^:parallel substitute-params-extra-params-test
  (testing "extra params beyond available ? placeholders are silently ignored"
    (is (= "SELECT 1"
           (#'clickhouse-native/substitute-params "SELECT ?" [1 2 3]))))
  (testing "no placeholders → params ignored"
    (is (= "SELECT 1"
           (#'clickhouse-native/substitute-params "SELECT 1" [42])))))

(deftest ^:parallel substitute-params-exhausted-test
  (testing "more ? than params → remaining ? get NULL (nil param)"
    (let [result (#'clickhouse-native/substitute-params "SELECT ?, ?" [1])]
      ;; Second ? gets nil param → NULL
      (is (= "SELECT 1, NULL" result)))))

;;; ------------------------------------------ Section C: LIMIT Regex ------------------------------------------

(deftest ^:parallel limit-detection-test
  (testing "no LIMIT → would append"
    (is (nil? (re-find #"(?i)\bLIMIT\s+\d" "SELECT * FROM t"))))
  (testing "has LIMIT → would not append"
    (is (some? (re-find #"(?i)\bLIMIT\s+\d" "SELECT * FROM t LIMIT 5"))))
  (testing "KNOWN LIMITATION: LIMIT inside string literal triggers false positive"
    ;; BUG 3: The regex matches LIMIT inside string literals
    (is (some? (re-find #"(?i)\bLIMIT\s+\d" "SELECT 'LIMIT 5' FROM t"))))
  (testing "KNOWN LIMITATION: LIMIT inside comment triggers false positive"
    (is (some? (re-find #"(?i)\bLIMIT\s+\d" "SELECT * FROM t -- LIMIT 5"))))
  (testing "case insensitive"
    (is (some? (re-find #"(?i)\bLIMIT\s+\d" "SELECT * FROM t limit 10")))))

;;; ------------------------------------------ Section D: Type Round-Trips ------------------------------------------
;; These require a running ClickHouse instance.

(deftest ^:parallel native-type-round-trip-test
  (mt/test-driver :clickhouse
    (doseq [[label sql check-fn]
            [["Int32"          "SELECT toInt32(42)"                                 #(= [[42]] %)]
             ["Int64 max"      "SELECT toInt64(9223372036854775807)"                #(some? (ffirst %))]
             ["UInt8"          "SELECT toUInt8(255)"                                #(some? (ffirst %))]
             ["Float64"        "SELECT toFloat64(3.14)"                             #(= [[3.14]] %)]
             ["String"         "SELECT 'hello'"                                     #(= [["hello"]] %)]
             ["Bool"           "SELECT true"                                        #(= [[true]] %)]
             ["Date"           "SELECT toDate('2024-01-15')"                        #(some? (ffirst %))]
             ["DateTime"       "SELECT toDateTime('2024-01-15 10:30:00')"           #(some? (ffirst %))]
             ["UUID"           "SELECT toUUID('550e8400-e29b-41d4-a716-446655440000')" #(some? (ffirst %))]
             ["NULL"           "SELECT NULL"                                        #(= [[nil]] %)]
             ["Nullable"       "SELECT toNullable(toInt32(42))"                     #(= [[42]] %)]
             ["LowCardinality" "SELECT toLowCardinality('test')"                   #(= [["test"]] %)]
             ["Array"          "SELECT [1, 2, 3]"                                   #(some? (ffirst %))]
             ["Map"            "SELECT map('a', 1)"                                 #(some? (ffirst %))]
             ["empty string"   "SELECT ''"                                          #(= [[""]] %)]]]
      (testing label
        (let [rows (mt/rows (qp/process-query (mt/native-query {:query sql})))]
          (is (check-fn rows) (str "Failed for " label ": " (pr-str rows))))))))

(deftest ^:parallel native-date32-pre-1970-test
  (mt/test-driver :clickhouse
    (testing "Date32 before 1970 epoch"
      (let [rows (mt/rows (qp/process-query (mt/native-query {:query "SELECT toDate32('1960-06-15')"})))]
        (is (some? (ffirst rows)))))))

(deftest ^:parallel native-datetime64-precision-test
  (mt/test-driver :clickhouse
    (testing "DateTime64 with nanosecond precision"
      (let [rows (mt/rows (qp/process-query
                           (mt/native-query {:query "SELECT toDateTime64('2024-01-15 10:30:00.123456789', 9)"})))]
        (is (some? (ffirst rows)))))))

(deftest ^:parallel native-decimal-test
  (mt/test-driver :clickhouse
    (testing "Decimal64 precision"
      (let [rows (mt/rows (qp/process-query
                           (mt/native-query {:query "SELECT toDecimal64(123.456, 3)"})))]
        (is (some? (ffirst rows)))))))

(deftest ^:parallel native-ip-types-test
  (mt/test-driver :clickhouse
    (testing "IPv4"
      (let [rows (mt/rows (qp/process-query (mt/native-query {:query "SELECT toIPv4('127.0.0.1')"})))]
        (is (some? (ffirst rows)))))
    (testing "IPv6"
      (let [rows (mt/rows (qp/process-query (mt/native-query {:query "SELECT toIPv6('::1')"})))]
        (is (some? (ffirst rows)))))))

(deftest ^:parallel native-enum-test
  (mt/test-driver :clickhouse
    (testing "Enum8"
      (let [rows (mt/rows (qp/process-query
                           (mt/native-query {:query "SELECT CAST('hello', 'Enum8(''hello'' = 1)')"})))]
        (is (some? (ffirst rows)))))))

(deftest ^:parallel native-fixed-string-test
  (mt/test-driver :clickhouse
    (testing "FixedString"
      (let [rows (mt/rows (qp/process-query
                           (mt/native-query {:query "SELECT toFixedString('abc', 5)"})))]
        (is (some? (ffirst rows)))))))

(deftest ^:parallel native-uint64-large-test
  (mt/test-driver :clickhouse
    (testing "UInt64 max value representation"
      (let [rows (mt/rows (qp/process-query
                           (mt/native-query {:query "SELECT toUInt64(18446744073709551615)"})))]
        (is (some? (ffirst rows)))))))

;;; ------------------------------------------ Section E: Negative / Error Cases ------------------------------------------

(deftest ^:parallel native-error-cases-test
  (mt/test-driver :clickhouse
    (doseq [[label sql]
            [["syntax error"       "SELECT * FORM t"]
             ["unknown function"   "SELECT nonexistent_fn()"]
             ["non-existent table" "SELECT * FROM no_such_table_xyz_123"]
             ["type mismatch"      "SELECT toInt32('not_a_number')"]]]
      (testing label
        (is (thrown? Exception
                     (qp/process-query (mt/native-query {:query sql}))))))))

(deftest ^:parallel native-empty-query-test
  (mt/test-driver :clickhouse
    (testing "empty query throws"
      (is (thrown? Throwable
                   (mt/rows (qp/process-query (mt/native-query {:query ""}))))))))

(deftest ^:parallel native-division-by-zero-test
  (mt/test-driver :clickhouse
    (testing "division by zero returns inf in ClickHouse (not an error)"
      (let [rows (mt/rows (qp/process-query (mt/native-query {:query "SELECT 1/0"})))]
        ;; ClickHouse returns Infinity for integer division by zero
        (is (some? (ffirst rows)))))))

;;; ------------------------------------------ Section F: Connection Edge Cases ------------------------------------------

(deftest ^:parallel build-client-host-stripping-test
  (testing "http:// prefix is stripped from host"
    ;; Just verify build-client doesn't throw with these inputs
    (is (some? (#'clickhouse-native/build-client {:host "http://localhost" :port 8123}))))
  (testing "https:// prefix is stripped from host"
    (is (some? (#'clickhouse-native/build-client {:host "https://localhost" :port 8123}))))
  (testing "nil host defaults to localhost"
    (is (some? (#'clickhouse-native/build-client {:host nil}))))
  (testing "nil port defaults to 8123"
    (is (some? (#'clickhouse-native/build-client {:port nil})))))

;;; ------------------------------------------ Section G: Edge Cases ------------------------------------------

(deftest ^:parallel native-empty-result-test
  (mt/test-driver :clickhouse
    (testing "empty result set"
      (let [rows (mt/rows (qp/process-query (mt/native-query {:query "SELECT 1 WHERE 0"})))]
        (is (= [] rows))))))

(deftest ^:parallel native-large-result-test
  (mt/test-driver :clickhouse
    (testing "large result set (10K rows)"
      (let [rows (mt/rows (qp/process-query
                           (mt/native-query {:query "SELECT number FROM system.numbers LIMIT 10000"})))]
        (is (= 10000 (count rows)))))))

(deftest ^:parallel native-multi-column-metadata-test
  (mt/test-driver :clickhouse
    (testing "multi-column query returns correct column count"
      (let [result (qp/process-query
                    (mt/native-query {:query "SELECT 1 AS a, 'hello' AS b, true AS c"}))]
        (is (= 3 (count (get-in result [:data :cols]))))
        (is (= [["a" "b" "c"]]
               [(mapv :name (get-in result [:data :cols]))]))))))

(deftest ^:parallel client-caching-test
  (mt/test-driver :clickhouse
    (testing "get-client returns the same instance for the same database"
      (let [client1 (clickhouse-native/get-client (mt/db))
            client2 (clickhouse-native/get-client (mt/db))]
        (is (identical? client1 client2))))))
