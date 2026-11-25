(ns metabase-enterprise.data-testing.compile-test
  "Tests for the SQL-building half of transform testing: the queries a run executes, and the
  quoting and parameterization that keep author-supplied text out of them."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase.driver :as driver]
   [metabase.driver.h2]
   [metabase.driver.postgres]))

(comment metabase.driver.h2/keep-me)
(comment metabase.driver.postgres/keep-me)

(defn- rows-query
  "`rows` compiled for `driver`, as `{:query :params}`."
  [driver columns sql-names rows]
  (data-testing.compile/rows-query driver columns sql-names rows))

;;; --------------------------------------------- rows-query ---------------------------------------------

(deftest row-values-are-bound-parameters-test
  (testing "no cell value reaches the SQL as text"
    ;; Security property. A hostile string is a parameter and nothing else; the SQL text it produces
    ;; is a bare `?`.
    (let [hostile                "'); DROP TABLE users; --"
          {:keys [query params]} (rows-query :postgres
                                             [{:name "note" :cast_type "VARCHAR(255)"}]
                                             ["NOTE"]
                                             [{"note" hostile}])]
      (is (= [hostile] params))
      (is (str/includes? query "CAST(? AS VARCHAR(255))"))
      (is (not (str/includes? query "DROP")) (pr-str query))
      (is (not (str/includes? query "--")) (pr-str query))
      (is (not (str/includes? query "'")) (pr-str query)))))

(deftest column-name-is-one-quoted-identifier-test
  (testing "a name SQL would otherwise read as a qualifier is quoted whole, not split on the dot"
    ;; `a.b` as a bare identifier would compile to `\"a\".\"b\"` — a reference to some other table's
    ;; column rather than to the column the author named.
    (let [{:keys [query]} (rows-query :postgres
                                      [{:name "a.b" :cast_type "INTEGER"}]
                                      ["a.b"]
                                      [{"a.b" 1}])]
      (is (str/includes? query "AS \"a.b\"") (pr-str query))
      (is (not (str/includes? query "\"a\".\"b\"")) (pr-str query))))
  (testing "a quote in the name is escaped by doubling rather than closing the identifier"
    (let [{:keys [query]} (rows-query :postgres
                                      [{:name "a\"b" :cast_type "INTEGER"}]
                                      ["a\"b"]
                                      [{"a\"b" 1}])]
      (is (str/includes? query "AS \"a\"\"b\"") (pr-str query)))))

(deftest database-type-that-is-not-a-type-name-is-quoted-test
  (testing "a cast target that could escape the cast is quoted as an identifier instead of spliced"
    ;; The database then refuses it as an unknown type, which is the point: the text never becomes
    ;; SQL of its own.
    (let [{:keys [query]} (rows-query :postgres
                                      [{:name "a" :cast_type "INT) FROM secrets; --"}]
                                      ["A"]
                                      [{"a" 1}])]
      (is (str/includes? query "CAST(? AS \"INT) FROM secrets; --\")") (pr-str query))
      (is (not (str/includes? query "AS INT) FROM secrets")) (pr-str query)))))

(deftest alias-comes-from-sql-names-value-from-declared-name-test
  (testing "the alias is the warehouse's spelling; the cell is looked up by the author's spelling"
    ;; The two differ whenever the engine folded the identifier — upper on H2 and Snowflake, lower on
    ;; Postgres. A row carrying both spellings pins which one the lookup uses.
    (let [{:keys [query params]} (rows-query :postgres
                                             [{:name "name" :cast_type "VARCHAR(255)"}]
                                             ["NAME"]
                                             [{"name" "by-declared-name"
                                               "NAME" "by-sql-name"}])]
      (is (= ["by-declared-name"] params))
      (is (str/includes? query "\"NAME\"") (pr-str query))
      (is (not (str/includes? query "\"name\"")) (pr-str query)))))

(deftest nil-cell-is-sql-null-test
  (testing "a nil cell renders as NULL rather than as a parameter"
    (let [{:keys [query params]} (rows-query :postgres
                                             [{:name "a" :cast_type "INTEGER"}]
                                             ["A"]
                                             [{"a" nil}])]
      (is (str/includes? query "CAST(NULL AS INTEGER)") (pr-str query))
      (is (= [] params))))
  (testing "a column the row omits is NULL too — a short row is not an error"
    (let [{:keys [query params]} (rows-query :postgres
                                             [{:name "a" :cast_type "INTEGER"}
                                              {:name "b" :cast_type "INTEGER"}]
                                             ["A" "B"]
                                             [{"a" 1}])]
      (is (str/includes? query "CAST(NULL AS INTEGER)") (pr-str query))
      (is (= [1] params)))))

(deftest no-rows-is-an-empty-result-with-the-declared-columns-test
  (testing "an empty rows list still names every column, and returns nothing"
    (let [{:keys [query params]} (rows-query :postgres
                                             [{:name "id" :cast_type "INTEGER"}
                                              {:name "name" :cast_type "VARCHAR(255)"}]
                                             ["ID" "NAME"]
                                             [])]
      (is (str/includes? query "CAST(NULL AS INTEGER) AS \"ID\"") (pr-str query))
      (is (str/includes? query "CAST(NULL AS VARCHAR(255)) AS \"NAME\"") (pr-str query))
      (is (str/includes? query "WHERE 1 = 0") (pr-str query))
      (is (= [] params)))))

(deftest several-rows-are-unioned-test
  (testing "one SELECT per row, joined with UNION ALL, parameters in row-major order"
    (let [{:keys [query params]} (rows-query :postgres
                                             [{:name "id" :cast_type "INTEGER"}
                                              {:name "name" :cast_type "VARCHAR(255)"}]
                                             ["ID" "NAME"]
                                             [{"id" 1 "name" "a"}
                                              {"id" 2 "name" "b"}
                                              {"id" 3 "name" "c"}])]
      (is (= 2 (count (re-seq #"UNION ALL" query))) (pr-str query))
      (is (= [1 "a" 2 "b" 3 "c"] params))))
  (testing "a single row is one SELECT with no set operation"
    (let [{:keys [query]} (rows-query :postgres
                                      [{:name "id" :cast_type "INTEGER"}]
                                      ["ID"]
                                      [{"id" 1}])]
      (is (not (str/includes? query "UNION")) (pr-str query)))))

(deftest declared-database-type-is-the-cast-target-test
  (testing "each cell is cast to the type its column declares"
    (let [{:keys [query]} (rows-query :postgres
                                      [{:name "id" :cast_type "INTEGER"}
                                       {:name "price" :cast_type "DECIMAL(10, 2)"}
                                       {:name "at" :cast_type "TIMESTAMP WITH TIME ZONE"}]
                                      ["ID" "PRICE" "AT"]
                                      [{"id" 1 "price" 2 "at" "2024-01-01"}])]
      (is (str/includes? query "CAST(? AS INTEGER)") (pr-str query))
      (is (str/includes? query "CAST(? AS DECIMAL(10, 2))") (pr-str query))
      (is (str/includes? query "CAST(? AS TIMESTAMP WITH TIME ZONE)") (pr-str query)))))

(deftest parameterization-does-not-depend-on-the-dialect-test
  (testing "values are parameters on every driver; only the quoting differs"
    (doseq [driver [:postgres :h2]]
      (testing driver
        (let [{:keys [query params]} (rows-query driver
                                                 [{:name "note" :cast_type "VARCHAR(255)"}]
                                                 ["NOTE"]
                                                 [{"note" "'); DROP TABLE users; --"}])]
          (is (= ["'); DROP TABLE users; --"] params))
          (is (str/includes? query "CAST(? AS VARCHAR(255))") (pr-str query))
          (is (not (str/includes? query "DROP")) (pr-str query)))))))

;;; ------------------------------------ Queries over the temp tables ------------------------------------

(deftest comparison-query-compares-both-directions-test
  (testing "rows are grouped over the declared columns and kept when the two sides disagree"
    (let [{:keys [query params]} (data-testing.compile/comparison-query :postgres "out" "exp" ["ID" "NAME"] ["ID" "NAME"])]
      (is (= [] params))
      (is (str/includes? query "UNION ALL") (pr-str query))
      (is (str/includes? query "GROUP BY \"ID\", \"NAME\"") (pr-str query))
      (is (str/includes? query "HAVING SUM(\"__mb_src\") <> 0") (pr-str query))))
  (testing "a column name the warehouse folded to something dotted stays one identifier"
    (let [{:keys [query]} (data-testing.compile/comparison-query :postgres "out" "exp" ["a.b"] ["a.b"])]
      (is (str/includes? query "GROUP BY \"a.b\"") (pr-str query))
      (is (not (str/includes? query "\"a\".\"b\"")) (pr-str query))))
  (testing "the expected table may spell the columns otherwise; the union pairs them by position"
    (let [{:keys [query]} (data-testing.compile/comparison-query :postgres "out" "exp" ["id" "name"] ["ID" "NAME"])]
      (is (str/includes? query "SELECT \"id\", \"name\", 1 AS \"__mb_src\" FROM \"out\"") (pr-str query))
      (is (str/includes? query "SELECT \"ID\", \"NAME\", -1 AS \"__mb_src\" FROM \"exp\"") (pr-str query))
      (is (str/includes? query "GROUP BY \"id\", \"name\"") (pr-str query)))))

(deftest row-count-and-columns-queries-test
  (testing "the row count is a plain COUNT over the table"
    (let [{:keys [query params]} (data-testing.compile/row-count-query :postgres "out")]
      (is (= "SELECT COUNT(1) AS \"__mb_count\" FROM \"out\"" query))
      (is (= [] params))))
  (testing "the columns probe selects everything and returns nothing"
    (let [{:keys [query params]} (data-testing.compile/columns-query :postgres "out")]
      (is (= "SELECT * FROM \"out\" WHERE 1 = 0" query))
      (is (= [] params))))
  (testing "a temp table name is quoted whole, `#` and all"
    (is (str/includes? (:query (data-testing.compile/columns-query :postgres "#mb_test_1"))
                       "\"#mb_test_1\""))))

;;; ------------------------------------------- compile-input -------------------------------------------

(deftest compile-input-sql-is-passed-through-test
  (testing "a :sql input compiles to its own SQL with no parameters"
    (is (= {:query "SELECT 1 AS x" :params []}
           (data-testing.compile/compile-input
            :h2
            {:table  {:schema "PUBLIC" :name "PEOPLE"}
             :format :sql
             :sql    "SELECT 1 AS x"})))))

(deftest compile-input-rows-names-columns-as-declared-test
  (testing "a :rows input names each column exactly as the author declared it"
    (let [{:keys [query params]} (data-testing.compile/compile-input
                                  :postgres
                                  {:table   {:schema "public" :name "people"}
                                   :format  :rows
                                   :columns [{:name "id" :cast_type "INTEGER"}]
                                   :rows    [{"id" 1}]})]
      (is (str/includes? query "CAST(? AS INTEGER) AS \"id\"") (pr-str query))
      (is (= [1] params)))))

(deftest driver-keywords-need-no-connection-test
  (testing "the drivers these tests format for load and initialize without a database"
    (is (= :postgres (driver/the-initialized-driver :postgres)))
    (is (= :h2 (driver/the-initialized-driver :h2)))))

;;; -------------------------------------------- rewrite-query --------------------------------------------

(def ^:private orders->temp
  "Replacements standing a temp table in for `orders`."
  {{:table "orders"} {:db nil :schema nil :table "mb_tmp"}})

(defn- rewrite
  "`compiled` rewritten for Postgres to read the temp table of [[orders->temp]], or the `:error-type` of the refusal."
  [compiled]
  (try
    (data-testing.compile/rewrite-query :postgres compiled orders->temp)
    (catch clojure.lang.ExceptionInfo e
      (:error-type (ex-data e)))))

(deftest rewrite-query-changes-only-the-table-references-test
  (testing "control: the table is replaced, and takes its own name as alias"
    (is (= {:query "SELECT id FROM mb_tmp AS orders" :params []}
           (rewrite {:query "SELECT id FROM orders" :params []}))))
  (testing "placeholders stay where they are, and the values in their order"
    (is (= {:query "SELECT strpos(?, ?) AS id FROM mb_tmp AS orders WHERE x=?AND y = ?" :params ["abcdef" "cd" 1 2]}
           (rewrite {:query "SELECT strpos(?, ?) AS id FROM orders WHERE x=?AND y = ?" :params ["abcdef" "cd" 1 2]}))))
  (testing "whitespace, case, comments and functions come back as written"
    (is (= {:query "select  date_part('year', created_at)  -- the year\nFROM mb_tmp o /* orders */" :params []}
           (rewrite {:query "select  date_part('year', created_at)  -- the year\nFROM orders o /* orders */" :params []}))))
  (testing "a ? in a string literal, a quoted name or a comment stays too"
    (is (= {:query "SELECT '?' AS \"?\", ? AS id /* ? */" :params ["x"]}
           (rewrite {:query "SELECT '?' AS \"?\", ? AS id /* ? */" :params ["x"]})))))

(deftest replace-tables-refuses-a-reference-it-cannot-replace-in-the-text-test
  (let [refusal (fn [sql replacements]
                  (try
                    (data-testing.compile/replace-tables :postgres sql replacements)
                    (catch clojure.lang.ExceptionInfo e
                      (select-keys (ex-data e) [:error-type :reason :detail]))))]
    (testing "control: a plain qualified reference is replaced"
      (is (= "SELECT id FROM mb_tmp AS orders"
             (refusal "SELECT id FROM public.orders" {{:schema "public" :table "orders"} {:db nil :schema nil :table "mb_tmp"}}))))
    (testing "a comment inside the reference"
      (is (= {:error-type ::data-testing.errors/unreplaceable-reference
              :reason     "reference-not-located"
              :detail     "public.orders"}
             (refusal "SELECT id FROM public /* c */ . orders"
                      {{:schema "public" :table "orders"} {:db nil :schema nil :table "mb_tmp"}}))))
    (testing "two tables of one name, each read without an alias"
      (is (= {:error-type ::data-testing.errors/unreplaceable-reference
              :reason     "ambiguous-table-name"
              :detail     "orders"}
             (refusal "SELECT a.orders.id FROM a.orders JOIN b.orders ON a.orders.id = b.orders.id"
                      {{:schema "a" :table "orders"} {:db nil :schema nil :table "mb_a"}
                       {:schema "b" :table "orders"} {:db nil :schema nil :table "mb_b"}}))))
    (testing "control: a column qualified by the table an UPDATE writes is qualified by the temp table"
      (is (= "UPDATE mb_tmp SET total = 0 WHERE mb_tmp.id = 1"
             (refusal "UPDATE orders SET total = 0 WHERE orders.id = 1"
                      {{:table "orders"} {:db nil :schema nil :table "mb_tmp"}}))))
    (testing "a column qualified by the written table's name, which an alias in the statement also has"
      (is (= {:error-type ::data-testing.errors/unreplaceable-reference
              :reason     "unaliased-name-reused"
              :detail     "orders"}
             (refusal "UPDATE orders SET total = (SELECT max(orders.total) FROM staging AS orders)"
                      {{:table "orders"}  {:db nil :schema nil :table "mb_tmp"}
                       {:table "staging"} {:db nil :schema nil :table "mb_staging"}}))))))
