(ns metabase.transform-testing.compile-test
  "Pure unit tests for the SQL-building half of transform testing: the two guards that keep
  author-supplied text out of the SQL, and the literal-rows relation those guards protect.

  No warehouse and no app DB. Driver keywords appear only so HoneySQL can pick a dialect."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.driver.h2]
   [metabase.driver.postgres]
   [metabase.transform-testing.compile :as transform-testing.compile]))

(comment metabase.driver.h2/keep-me)
(comment metabase.driver.postgres/keep-me)

(defn- compiled-rows
  "`rows` compiled as a relation for `driver`, as `{:query :params}`."
  [driver columns sql-names rows]
  (transform-testing.compile/compiled
   driver
   (transform-testing.compile/rows-relation columns sql-names rows)))

;;; ------------------------------------------ Identifier guard ------------------------------------------

(deftest ordinary-column-name-is-safe-test
  (testing "a name that can be written as one quoted identifier is accepted"
    (doseq [column-name ["id"
                         "order_id"
                         "a b"                                      ; spaces are fine: quoting handles them
                         "2024"                                     ; digits-only is a legal quoted identifier
                         "año"
                         "日本語"
                         "select"                                   ; a reserved word is fine once quoted
                         "Total ($)"]]
      (is (nil? (transform-testing.compile/unsafe-identifier-reason column-name))
          (pr-str column-name)))))

(deftest dotted-column-name-is-refused-test
  (testing "a dot makes the name a qualified reference rather than one identifier"
    ;; HoneySQL splits on the dot: `a.b` renders as `"a"."b"`, which names column `b` of table `a`.
    ;; Unguarded, a comparison would silently read a different table's column and report on it.
    (is (some? (transform-testing.compile/unsafe-identifier-reason "a.b")))
    (is (some? (transform-testing.compile/unsafe-identifier-reason "public.people")))))

(deftest unsafe-column-name-is-refused-test
  (testing "characters that break out of, or change the meaning of, a quoted identifier are refused"
    (doseq [[desc column-name] [["semicolon"        "id; DROP TABLE users"]
                                ["double quote"     "id\" , (SELECT 1) AS \"x"]
                                ["dot"              "orders.id"]
                                ["tab"              "id\tname"]
                                ["newline"          "id\nname"]
                                ["NUL"              "id\u0000"]
                                ["delete character" "id"]]]
      (testing desc
        (is (some? (transform-testing.compile/unsafe-identifier-reason column-name))
            (pr-str column-name))))))

(deftest unsafe-identifier-reason-is-a-message-test
  (testing "the reason reads as the tail of a sentence, so callers can splice it into one"
    (is (= "it contains a dot, which SQL reads as a table qualifier"
           (transform-testing.compile/unsafe-identifier-reason "a.b")))
    (is (= "it contains a semicolon" (transform-testing.compile/unsafe-identifier-reason "a;b")))
    (is (= "it contains a double quote" (transform-testing.compile/unsafe-identifier-reason "a\"b")))
    (is (= "it contains a control character" (transform-testing.compile/unsafe-identifier-reason "a\tb")))))

;;; ---------------------------------------- database_type guard ----------------------------------------
;;;
;;; A cast target cannot be a bound parameter — `CAST(? AS <type>)` needs the type as literal SQL text —
;;; and since the column carries `:database_type`, that text is written by the author. It is the one
;;; author-supplied string that reaches the SQL as text rather than as a parameter.

(deftest plain-database-type-is-accepted-test
  (testing "a plain type name, optionally with numeric precision, is accepted"
    (doseq [db-type ["INTEGER"
                     "VARCHAR"
                     "VARCHAR(255)"
                     "DECIMAL(10,2)"
                     "DECIMAL(10, 2)"
                     "TIMESTAMP WITH TIME ZONE"
                     "DOUBLE PRECISION"
                     "CHARACTER VARYING(255)"
                     "TIMESTAMP_NTZ(9)"
                     "BIGINT UNSIGNED"
                     "integer"
                     "varchar(255)"
                     "timestamp with time zone"]]
      (is (nil? (transform-testing.compile/unsafe-database-type-reason db-type))
          (pr-str db-type)))))

(deftest database-type-injection-guard-test
  (testing "an injection-shaped type is refused"
    ;; The guard's whole job: this string spliced into `CAST(? AS …)` closes the cast, appends a
    ;; second FROM and comments out the rest of the query.
    (is (some? (transform-testing.compile/unsafe-database-type-reason "INT) FROM secrets; --")))))

(deftest unsafe-database-type-is-refused-test
  (testing "text that could reach outside its own cast is refused"
    (doseq [[desc db-type] [["balanced but misnested"  "INT)) FROM x (("]
                            ["statement terminator"    "INT; DROP TABLE users"]
                            ["single quote"            "INT'"]
                            ["double quote"            "INT\""]
                            ["line comment"            "INT -- x"]
                            ["block comment"           "INT /* x */"]
                            ["escaping the cast"       "INT) FROM secrets"]
                            ["unbalanced parenthesis"  "INT("]
                            ["extra parenthesis"       "VARCHAR(255))"]
                            ["non-numeric precision"   "VARCHAR('a')"]
                            ["set operation with SQL"  "INT) UNION SELECT * FROM secrets --"]
                            ["newline"                 "INT\nDROP TABLE users"]
                            ["NUL"                     "INT\u0000"]
                            ["whitespace only"         "   "]
                            ["empty"                   ""]]]
      (testing desc
        (is (some? (transform-testing.compile/unsafe-database-type-reason db-type))
            (pr-str db-type))))))

(deftest database-type-guard-accepts-real-types-test
  (testing "types a warehouse really reports for a real column are accepted"
    ;; The guard asks whether the text could escape its cast, not whether it looks like a type name.
    ;; Every entry here was refused by an earlier allowlist-shaped check, which is the failure this
    ;; shape exists to avoid: turning away a real type breaks an author who did nothing wrong.
    (doseq [[engine db-type] [["Postgres array"            "INT[]"]
                              ["Postgres array, precise"   "NUMERIC(10,2)[]"]
                              ["Postgres schema-qualified" "public.my_enum"]
                              ["quoted type name"          "\"MyType\""]
                              ["SQL Server"                "VARCHAR(MAX)"]
                              ["ANSI, non-terminal size"   "TIMESTAMP(3) WITH TIME ZONE"]
                              ["Oracle"                    "VARCHAR2(4000 CHAR)"]
                              ["PostGIS"                   "geometry(Point,4326)"]
                              ["BigQuery"                  "ARRAY<INT64>"]
                              ["Databricks / Hive"         "MAP<STRING, INT>"]
                              ["ANSI interval"             "INTERVAL DAY(2) TO SECOND(6)"]]]
      (testing engine
        (is (nil? (transform-testing.compile/unsafe-database-type-reason db-type))
            (pr-str db-type))))))

(deftest database-type-guard-admits-nonsense-that-cannot-escape-test
  (testing "a string of bare words passes, whether or not it names a type"
    ;; Deliberate, and the price of not rejecting real types. Neither of these can leave the
    ;; `CAST(? AS …)` it sits in — no parenthesis closes, no statement terminates, nothing is
    ;; commented out — so the engine answers with a syntax error. A poor error message, and a far
    ;; better failure than turning away `INT[]`.
    (is (nil? (transform-testing.compile/unsafe-database-type-reason "INT UNION SELECT password FROM users")))
    (is (nil? (transform-testing.compile/unsafe-database-type-reason "DROP TABLE users")))))

;;; ------------------------------------------ compiled shape ------------------------------------------

(deftest compiled-returns-query-and-param-vector-test
  (testing "a parameterless form still gets an empty param vector, never nil and never a lazy seq"
    (let [{:keys [query params]} (transform-testing.compile/compiled
                                  :postgres {:select [[[:inline 1] :one]]})]
      (is (string? query))
      (is (vector? params))
      (is (= [] params))))
  (testing "parameters come back in order, separate from the SQL"
    (let [{:keys [query params]} (transform-testing.compile/compiled
                                  :postgres {:select [[[:inline 1] :one]]
                                             :from   [:t]
                                             :where  [:and [:= :a "x"] [:= :b "y"]]})]
      (is (vector? params))
      (is (= ["x" "y"] params))
      (is (not (str/includes? query "'x'"))))))

;;; --------------------------------------- rows-relation + compiled ---------------------------------------

(deftest row-values-are-bound-parameters-test
  (testing "no cell value reaches the SQL as text"
    ;; Security property. A hostile string is a parameter and nothing else; the SQL text it produces
    ;; is a bare `?`.
    (let [hostile               "'); DROP TABLE users; --"
          {:keys [query params]} (compiled-rows :postgres
                                                [{:name "note" :database_type "VARCHAR(255)"}]
                                                ["NOTE"]
                                                [{"note" hostile}])]
      (is (= [hostile] params))
      (is (str/includes? query "CAST(? AS VARCHAR(255))"))
      (is (not (str/includes? query "DROP")) (pr-str query))
      (is (not (str/includes? query "--")) (pr-str query))
      (is (not (str/includes? query "'")) (pr-str query)))))

(deftest alias-comes-from-sql-names-value-from-declared-name-test
  (testing "the alias is the warehouse's spelling; the cell is looked up by the author's spelling"
    ;; The two differ whenever the engine folded the identifier — upper on H2 and Snowflake, lower on
    ;; Postgres. A row carrying both spellings pins which one the lookup uses.
    (let [{:keys [query params]} (compiled-rows :postgres
                                                [{:name "name" :database_type "VARCHAR(255)"}]
                                                ["NAME"]
                                                [{"name" "by-declared-name"
                                                  "NAME" "by-sql-name"}])]
      (is (= ["by-declared-name"] params))
      (is (str/includes? query "\"NAME\"") (pr-str query))
      (is (not (str/includes? query "\"name\"")) (pr-str query)))))

(deftest nil-cell-is-sql-null-test
  (testing "a nil cell renders as NULL rather than as a parameter"
    (let [{:keys [query params]} (compiled-rows :postgres
                                                [{:name "a" :database_type "INTEGER"}]
                                                ["A"]
                                                [{"a" nil}])]
      (is (str/includes? query "CAST(NULL AS INTEGER)") (pr-str query))
      (is (= [] params))))
  (testing "a column the row omits is NULL too — a short row is not an error"
    (let [{:keys [query params]} (compiled-rows :postgres
                                                [{:name "a" :database_type "INTEGER"}
                                                 {:name "b" :database_type "INTEGER"}]
                                                ["A" "B"]
                                                [{"a" 1}])]
      (is (str/includes? query "CAST(NULL AS INTEGER)") (pr-str query))
      (is (= [1] params)))))

(deftest several-rows-are-unioned-test
  (testing "one SELECT per row, joined with UNION ALL, parameters in row-major order"
    (let [{:keys [query params]} (compiled-rows :postgres
                                                [{:name "id" :database_type "INTEGER"}
                                                 {:name "name" :database_type "VARCHAR(255)"}]
                                                ["ID" "NAME"]
                                                [{"id" 1 "name" "a"}
                                                 {"id" 2 "name" "b"}
                                                 {"id" 3 "name" "c"}])]
      (is (= 2 (count (re-seq #"UNION ALL" query))) (pr-str query))
      (is (= 3 (count (re-seq #"SELECT" query))) (pr-str query))
      (is (= [1 "a" 2 "b" 3 "c"] params))))
  (testing "a single row is one SELECT with no set operation"
    (let [{:keys [query]} (compiled-rows :postgres
                                         [{:name "id" :database_type "INTEGER"}]
                                         ["ID"]
                                         [{"id" 1}])]
      (is (not (str/includes? query "UNION")) (pr-str query)))))

(deftest declared-database-type-is-the-cast-target-test
  (testing "each cell is cast to the type its column declares"
    (let [{:keys [query]} (compiled-rows :postgres
                                         [{:name "id" :database_type "INTEGER"}
                                          {:name "price" :database_type "DECIMAL(10, 2)"}
                                          {:name "at" :database_type "TIMESTAMP WITH TIME ZONE"}]
                                         ["ID" "PRICE" "AT"]
                                         [{"id" 1 "price" 2 "at" "2024-01-01"}])]
      (is (str/includes? query "CAST(? AS INTEGER)") (pr-str query))
      (is (str/includes? query "CAST(? AS DECIMAL(10, 2))") (pr-str query))
      (is (str/includes? query "CAST(? AS TIMESTAMP WITH TIME ZONE)") (pr-str query)))))

(deftest rows-relation-checks-its-database-type-test
  (testing "rows-relation refuses a type that could escape its cast, rather than rendering it"
    ;; The check lives here, at the point where the text stops being data and becomes SQL, so no
    ;; caller can reach the splice without it. That matters for a caller that does not exist yet:
    ;; a `:rows` input will arrive through `driver/compile-rows-query` and land on this same
    ;; function.
    (let [e (try (compiled-rows :postgres
                                [{:name "a" :database_type "INT) FROM secrets; --"}]
                                ["A"]
                                [{"a" 1}])
                 nil
                 (catch clojure.lang.ExceptionInfo e e))]
      (is (some? e) "the splice must refuse, not render")
      (is (= :metabase.transform-testing.errors/unsafe-identifier (:error-type (ex-data e))))))
  (testing "and it refuses eagerly, before anything realizes the relation"
    ;; A lazy `for` would defer the refusal into HoneySQL's formatting, past any caller prepared to
    ;; catch it. Calling rows-relation alone, with nothing forcing the result, must still throw.
    (is (thrown? clojure.lang.ExceptionInfo
                 (transform-testing.compile/rows-relation
                  [{:name "a" :database_type "INT) FROM secrets; --"}]
                  ["A"]
                  [{"a" 1}])))))

(deftest parameterization-does-not-depend-on-the-dialect-test
  (testing "values are parameters on every driver; only the quoting differs"
    (doseq [driver [:postgres :h2]]
      (testing driver
        (let [{:keys [query params]} (compiled-rows driver
                                                    [{:name "note" :database_type "VARCHAR(255)"}]
                                                    ["NOTE"]
                                                    [{"note" "'); DROP TABLE users; --"}])]
          (is (= ["'); DROP TABLE users; --"] params))
          (is (str/includes? query "CAST(? AS VARCHAR(255))") (pr-str query))
          (is (not (str/includes? query "DROP")) (pr-str query)))))))

;;; ------------------------------------------- compile-input -------------------------------------------

(deftest compile-input-sql-is-passed-through-test
  (testing "a :sql input compiles to its own SQL with no parameters"
    (is (= {:query "SELECT 1 AS x" :params []}
           (transform-testing.compile/compile-input
            :h2
            {:table  {:schema "PUBLIC" :name "PEOPLE"}
             :format :sql
             :sql    "SELECT 1 AS x"})))))

(deftest driver-keywords-need-no-connection-test
  (testing "the drivers these tests format for load and initialize without a database"
    (is (= :postgres (driver/the-initialized-driver :postgres)))
    (is (= :h2 (driver/the-initialized-driver :h2)))))
