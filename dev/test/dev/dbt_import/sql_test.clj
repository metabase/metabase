(ns dev.dbt-import.sql-test
  "[[dev.dbt-import.sql]] on its own, with a column callback that resolves every name to one column of the test
  metadata: the parts of the conversion that depend on the dialect, and the SQL a converted condition compiles to.
  The conversion of the whole SQL subset through the pipeline is in [[dev.dbt-import.resolve-test]]."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing use-fixtures]]
   [clojure.walk :as walk]
   [dev.dbt-import.sql :as sql]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]))

;; compiling a query runs the whole preprocessing pipeline, parts of which read the app DB
(use-fixtures :once (fixtures/initialize :db))

(defn- resolve-name
  "The column callback: every identifier is `venues.name`."
  [_identifier]
  (lib/ref (meta/field-metadata :venues :name)))

(def ^:private venue-name
  "The ref [[resolve-name]] returns, without its uuid."
  [:field {:base-type :type/Text, :effective-type :type/Text} (meta/id :venues :name)])

(defn- without-uuids
  "`clause` with the `:lib/uuid` of every clause in it removed, for an `is` to compare."
  [clause]
  (walk/postwalk (fn [x] (if (map? x) (dissoc x :lib/uuid) x)) clause))

(defn- condition
  "The filter clause the SQL `condition` converts to in `dialect`, uuids removed; the reason when it is reported."
  [dialect condition]
  (try
    (without-uuids (sql/condition->mbql dialect condition resolve-name))
    (catch clojure.lang.ExceptionInfo e
      (ex-message e))))

(defn- expression
  "The expression the SQL `expression` converts to in `dialect`, uuids removed; the reason when it is reported."
  [dialect expression]
  (try
    (without-uuids (sql/expression->mbql dialect expression resolve-name))
    (catch clojure.lang.ExceptionInfo e
      (ex-message e))))

(defn- where-sql
  "The `WHERE` clause of the H2 SQL a query filtered by the converted `condition` (in the Postgres dialect) compiles to,
  with the column spelled `name`."
  [condition]
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/filter (sql/condition->mbql "postgres" condition resolve-name))
                  (lib/aggregate (lib/count)))]
    (driver/with-driver :h2
      (-> (qp.compile/compile query)
          :query
          (str/replace #"\"PUBLIC\"\.\"VENUES\"\.\"NAME\"" "name")
          (str/replace #"^.* WHERE " "")))))

(deftest ^:parallel negation-sql-test
  (testing (str "a negated condition compiles to SQL that leaves the null rows out, as the warehouse's own does: never"
                " to Lib's != or not-in, or to NOT over a string filter alone, which Metabase compiles to include them")
    (are [sql where] (= where (where-sql sql))
      "name != 'a'"                    "NOT (name = ?)"
      "name <> 'a'"                    "NOT (name = ?)"
      "NOT (name = 'a')"               "NOT (name = ?)"
      "name NOT IN ('a', 'b')"         "NOT (name = ?) AND NOT (name = ?)"
      "NOT (name IN ('a', 'b'))"       "NOT (name = ?) AND NOT (name = ?)"
      "name NOT LIKE '%a%'"            "(name IS NOT NULL) AND (NOT (name LIKE ?) OR (name IS NULL))"
      "NOT (name LIKE 'a%')"           "(name IS NOT NULL) AND (NOT (name LIKE ?) OR (name IS NULL))"
      "name NOT LIKE 'a!%' ESCAPE '!'" "(name IS NOT NULL) AND NOT (name = ?)"
      "name NOT LIKE 'a_b'"            "(name IS NOT NULL) AND NOT (REGEXP_SUBSTR(name, ?) IS NOT NULL)"
      "name !~ '^a'"                   "(name IS NOT NULL) AND NOT (REGEXP_SUBSTR(name, ?) IS NOT NULL)"
      "NOT regexp_like(name, '^a')"    "(name IS NOT NULL) AND NOT (REGEXP_SUBSTR(name, ?) IS NOT NULL)"
      "name NOT SIMILAR TO 'a%'"       "(name IS NOT NULL) AND NOT (REGEXP_SUBSTR(name, ?) IS NOT NULL)"))
  (testing "where SQL itself counts the null rows, so does the clause: IS DISTINCT FROM and IS NOT TRUE"
    (are [sql where] (= where (where-sql sql))
      "name IS DISTINCT FROM 'a'" "(name <> ?) OR (name IS NULL)"
      "name IS NOT TRUE"          "((name <> TRUE) OR (name IS NULL)) OR (name IS NULL)")))

(deftest ^:parallel negation-spelling-test
  (testing "the spellings of one negation convert to one clause"
    (are [a b] (= (condition "postgres" a) (condition "postgres" b))
      "name != 'a'"             "NOT (name = 'a')"
      "name <> 'a'"             "name != 'a'"
      "name NOT IN ('a', 'b')"  "NOT (name IN ('a', 'b'))"
      "name NOT LIKE 'a%'"      "NOT (name LIKE 'a%')"
      "name NOT ILIKE 'a%'"     "NOT (name ILIKE 'a%')"
      "name !~ '^a'"            "NOT (name ~ '^a')"
      "name !~ '^a'"            "NOT regexp_like(name, '^a')"
      "name NOT SIMILAR TO 'a'" "NOT (name SIMILAR TO 'a')"
      "name NOT LIKE 'a!%' ESCAPE '!'" "NOT (name LIKE 'a!%' ESCAPE '!')"))
  (testing "the clauses"
    (are [sql clause] (= clause (condition "postgres" sql))
      "name != 'a'"            [:not {} [:= {} venue-name "a"]]
      "name NOT IN ('a', 'b')" [:not {} [:in {} venue-name "a" "b"]]
      "name NOT LIKE 'a%'"     [:and {} [:not-null {} venue-name] [:not {} [:starts-with {} venue-name "a"]]]
      "name NOT LIKE '%'"      [:and {} [:not-null {} venue-name] [:not {} [:not-null {} venue-name]]]
      "name !~ '^a'"
      [:and {} [:not-null {} venue-name] [:not {} [:not-null {} [:regex-match-first {} venue-name "(^a)"]]]])))

(deftest ^:parallel like-default-escape-test
  (testing "a backslash in a LIKE pattern without ESCAPE is the escape character where the warehouse makes it one"
    (are [dialect] (= [:= {} venue-name "100%"] (condition dialect "name LIKE '100\\%'"))
      "postgres" "redshift" "mysql" "bigquery" "spark" "databricks" "hive" "clickhouse"))
  (testing "and a backslash where it does not"
    (are [dialect] (= [:starts-with {} venue-name "100\\"] (condition dialect "name LIKE '100\\%'"))
      "snowflake" "tsql" "oracle" "sqlite" "trino" "presto"))
  (testing "on a dialect whose default is not known, a pattern with a backslash is reported; one without converts"
    (are [dialect] (re-find #"has a backslash, and whether .* reads one as the escape character"
                            (condition dialect "name LIKE '100\\%'"))
      "druid" nil)
    (is (re-find #"whether the default dialect reads" (condition nil "name LIKE '100\\%'")))
    (is (= [:starts-with {} venue-name "100"] (condition nil "name LIKE '100%'"))))
  (testing "an ESCAPE clause says which character it is on every dialect"
    (are [dialect] (= [:= {} venue-name "100%"] (condition dialect "name LIKE '100!%' ESCAPE '!'"))
      "postgres" "snowflake" "druid" nil)
    (is (= [:= {} venue-name "100%"] (condition "snowflake" "name LIKE '100\\\\%' ESCAPE '\\\\'"))))
  (testing "SQL Server reads [ as a character class, which Lib's string filters cannot express"
    (is (re-find #"has a \[, which SQL Server reads as a character class" (condition "tsql" "name LIKE '[ab]%'")))
    (is (= [:starts-with {} venue-name "[ab]"] (condition "postgres" "name LIKE '[ab]%'")))))

(deftest ^:parallel decimal-cast-test
  (testing "a cast to a decimal with a scale rounds to it, which Metabase's float conversion does not"
    (are [sql reason] (re-find reason (expression "postgres" sql))
      "cast(name as decimal(10, 2))" #"CAST\(name AS DECIMAL\(10, 2\)\) rounds to 2 decimal places"
      "name::numeric(12)"            #"rounds to 0 decimal places"
      "cast(name as decimal(38, 0))" #"rounds to 0 decimal places"))
  (testing "a bare DECIMAL keeps every digit on Postgres, BigQuery and SQLite, and is a scale-0 type elsewhere"
    (are [dialect] (= [:float {} venue-name] (expression dialect "cast(name as decimal)"))
      "postgres" "bigquery" "sqlite")
    (are [dialect] (re-find #"cast to a fixed-point type of scale 0 on .*, which rounds to a whole number"
                            (expression dialect "cast(name as decimal)"))
      "mysql" "redshift" "tsql" "oracle" "databricks" "spark" "trino" nil)
    (testing "Snowflake's NUMBER arrives from sqlglot with its scale"
      (is (re-find #"rounds to 0 decimal places" (expression "snowflake" "cast(name as number)")))))
  (testing "a cast to a float is the same everywhere"
    (is (= [:float {} venue-name] (expression "mysql" "cast(name as double)")))))

(deftest ^:parallel integer-cast-test
  (testing (str "where the warehouse drops the fraction and Metabase's integer conversion rounds it, a cast of a value"
                " that is not known to be an integer is reported")
    (are [dialect] (re-find #"CAST\(name AS \w+\) drops the fraction on .*, where Metabase's integer conversion rounds"
                            (expression dialect "cast(name as integer)"))
      "spark" "databricks" "sqlite" "clickhouse" "redshift"))
  (testing "where both round, it converts"
    (are [dialect] (= [:integer {} venue-name] (expression dialect "cast(name as integer)"))
      "postgres" "mysql" "snowflake" "bigquery" "tsql" nil))
  (testing "a value that is already an integer casts the same way everywhere"
    (is (= [:integer {} [:length {} venue-name]] (expression "databricks" "cast(length(name) as bigint)")))))

(deftest ^:parallel jinja-test
  (testing "Jinja anywhere in the SQL, a string literal included: dbt renders the template before the warehouse sees it"
    (are [sql] (sql/jinja? sql)
      "{{ var('x') }} = 1"
      "name = '{{ var(\"x\") }}'"
      "{% if true %}name = 1{% endif %}"
      "name = 1 {# a comment #}"
      "name = '{{'"))
  (testing "braces that are not Jinja"
    (are [sql] (not (sql/jinja? sql))
      "name = '{'"
      "name = '{ \"a\": 1 }'"
      "name = '}}'"))
  (testing "a condition with Jinja is reported as that"
    (is (re-find #"could not parse .*: it still contains Jinja" (condition "postgres" "name = '{{ var(\"x\") }}'")))))

(deftest ^:parallel truncation-unit-test
  (testing "the units date_trunc and a dbt grain take, in either spelling"
    (are [unit-name unit] (= unit (sql/truncation-unit unit-name))
      "MILLISECOND"  :millisecond
      "MILLISECONDS" :millisecond
      "second"       :second
      "MINUTE"       :minute
      "hour"         :hour
      "DAY"          :day
      "days"         :day
      "week"         :week
      "MONTH"        :month
      "quarter"      :quarter
      "YEAR"         :year
      "years"        :year))
  (testing "units Metabase cannot truncate to"
    (are [unit-name] (nil? (sql/truncation-unit unit-name))
      "nanosecond" "microsecond" "decade" "century" "dow" "day_of_week" ""))
  (testing "so date_trunc converts to a bucket by second, and not by a unit Metabase lacks"
    (is (= :second (get-in (expression "postgres" "date_trunc('second', name)") [1 :temporal-unit])))
    (is (re-find #"truncating a date to MICROSECOND" (expression "postgres" "date_trunc('microsecond', name)")))))

(deftest ^:parallel literal-test
  (testing "a number no double holds would reach the YAML as infinity, so it is reported"
    (are [sql] (re-find #"the number 1e400 is too large to represent" (expression "postgres" sql))
      "1e400"
      "name * 1e400")
    (is (= [:* {} venue-name 1.0E300] (expression "postgres" "name * 1e300"))))
  (testing "round to more decimals than 10^n fits a long for"
    (is (re-find #"round to 19 decimals is not supported; only a literal from 0 to 18 is"
                 (expression "postgres" "round(name, 19)")))
    (is (= [:/ {} [:round {} [:* {} venue-name 1000000000000000000]] 1000000000000000000]
           (expression "postgres" "round(name, 18)")))))

(deftest ^:parallel simple-case-null-test
  (testing "CASE x WHEN NULL is x = NULL, never true in SQL, where the [:= x nil] it would become is IS NULL"
    (are [sql] (re-find #"compares against NULL, which is never true in SQL" (expression "postgres" sql))
      "case name when null then 1 else 0 end"
      "case name when 'a' then 1 when null then 2 end"
      "case null when name then 1 end"))
  (testing "a NULL branch value is fine"
    (is (= [:case {} [[[:= {} venue-name "a"] nil]] 1]
           (expression "postgres" "case name when 'a' then null else 1 end")))))

(def ^:private cast-conversions
  "Every SQL type [[sql/cast-targets]] knows a cast to, spelled as a project would write it, and the Lib conversion
  it becomes."
  {"tinyint"      :integer
   "smallint"     :integer
   "int"          :integer
   "bigint"       :integer
   "decimal"      :float
   "float"        :float
   "double"       :float
   "char"         :text
   "nchar"        :text
   "varchar"      :text
   "nvarchar"     :text
   "text"         :text
   "date"         :date
   "datetime"     :datetime
   "timestamp"    :datetime
   "timestamptz"  :datetime
   "timestampltz" :datetime
   "timestampntz" :datetime})

(deftest ^:parallel cast-targets-test
  (testing "every type in the table converts to its Lib conversion, on a dialect where none of them is reported"
    (doseq [[sql-type conversion] cast-conversions]
      (testing sql-type
        (is (= [conversion {} venue-name] (expression "postgres" (format "cast(name as %s)" sql-type)))))))
  (testing "the table here is the whole of the converter's: a type added there needs its row here"
    (is (= (set (keys @#'sql/cast-targets)) (into #{} (map u/upper-case-en) (keys cast-conversions)))))
  (testing "a cast to a type with no Lib conversion is reported, naming the type"
    (are [sql-type] (= (format "a cast to %s, CAST(name AS %s), is not supported" sql-type sql-type)
                       (expression "postgres" (format "cast(name as %s)" (u/lower-case-en sql-type))))
      "BOOLEAN" "INTERVAL" "UUID" "JSON")))

(deftest ^:parallel function-edge-test
  (testing "REPLACE needs its replacement: sqlglot accepts the two-argument form, which Lib has no equivalent for"
    (is (= "REPLACE without a replacement is not supported: REPLACE(name, 'a')"
           (expression "postgres" "replace(name, 'a')")))
    (is (= [:replace {} venue-name "a" "b"] (expression "postgres" "replace(name, 'a', 'b')"))))
  (testing "extracting the week depends on the first day of the week, like the day of the week, and is reported"
    (are [sql] (= "extracting WEEK from a date is not supported" (expression "postgres" sql))
      "extract(week from name)"
      "date_part('week', name)"))
  (testing "the current timestamp and date, in every spelling"
    (are [sql clause] (= clause (expression "postgres" sql))
      "current_timestamp" [:now {}]
      "now()"             [:now {}]
      "current_date"      [:today {}])))
