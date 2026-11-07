(ns metabase.sql-to-mbql.expression-test
  "[[metabase.sql-to-mbql.expression]] with a column callback that resolves every name to one column of the test
  metadata: the parts of the conversion that depend on the dialect, and the SQL a converted condition compiles to. The
  semantic layer import's tests convert the rest of the SQL subset through its pipeline, in
  `metabase-enterprise.semantic-layer-import.dbt.resolve-test`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing use-fixtures]]
   [clojure.walk :as walk]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-to-mbql.expression :as sql-to-mbql.expression]
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

(defn- reason
  "The message of the exception `thunk` throws, when it is one [[sql-to-mbql.expression/unsupported?]] recognises."
  [thunk]
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (if (sql-to-mbql.expression/unsupported? e)
        (ex-message e)
        (throw e)))))

(defn- condition
  "The filter clause the SQL condition `sql` converts to in `dialect`, uuids removed; the reason when it is reported."
  [dialect sql]
  (reason #(without-uuids (sql-to-mbql.expression/expression->mbql dialect sql resolve-name {:condition? true}))))

(defn- expression
  "The expression the SQL value expression `sql` converts to in `dialect`, uuids removed; the reason when it is
  reported."
  [dialect sql]
  (reason #(without-uuids (sql-to-mbql.expression/expression->mbql dialect sql resolve-name))))

(defn- where-sql
  "The `WHERE` clause of the H2 SQL a query filtered by the converted condition `sql` (in the Postgres dialect)
  compiles to, with the column spelled `name`."
  [sql]
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/filter (sql-to-mbql.expression/expression->mbql "postgres" sql resolve-name {:condition? true}))
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

(deftest ^:parallel truncation-unit-test
  (testing "the units date_trunc takes, in either spelling"
    (are [unit-name unit] (= unit (sql-to-mbql.expression/truncation-unit unit-name))
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
    (are [unit-name] (nil? (sql-to-mbql.expression/truncation-unit unit-name))
      "nanosecond" "microsecond" "decade" "century" "dow" "day_of_week" ""))
  (testing "so date_trunc converts to a bucket by second, and not by a unit Metabase lacks"
    (is (= :second (get-in (expression "postgres" "date_trunc('second', name)") [1 :temporal-unit])))
    (is (re-find #"truncating a date to MICROSECOND" (expression "postgres" "date_trunc('microsecond', name)")))))

(deftest ^:parallel literal-test
  (testing "a number no double holds would be infinity, so it is reported"
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
  "Every SQL type [[sql-to-mbql.expression/cast-targets]] knows a cast to, spelled in lower case, and the Lib
  conversion it becomes."
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
    (is (= (set (keys @#'sql-to-mbql.expression/cast-targets))
           (into #{} (map u/upper-case-en) (keys cast-conversions)))))
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

(deftest ^:parallel condition-option-test
  (testing "a comparison is a condition: a filter clause with :condition?, and reported as a value"
    (is (= [:= {} venue-name "a"] (condition "postgres" "name = 'a'")))
    (is (= "name = 'a' (EQ) is not supported" (expression "postgres" "name = 'a'"))))
  (testing "a value comes back as a Lib expression, or as itself when it is a literal"
    (is (= venue-name (expression "postgres" "name")))
    (is (= 1 (expression "postgres" "1")))
    (is (nil? (expression "postgres" "NULL"))))
  (testing "a bare column as a condition is column = true, so one that is not boolean is reported"
    (is (= "name is not a boolean column, so it cannot stand alone as a condition" (condition "postgres" "name")))))

(deftest ^:parallel boolean-case-condition-test
  (testing "a CASE whose results are TRUE, FALSE or NULL is a condition: the conditions of its leading TRUE branches"
    (are [sql clause] (= clause (condition "postgres" sql))
      "CASE WHEN name = 'a' THEN TRUE ELSE FALSE END"         [:= {} venue-name "a"]
      "case when name = 'a' then true end"                    [:= {} venue-name "a"]
      "CASE WHEN name = 'a' THEN TRUE ELSE NULL END"          [:= {} venue-name "a"]
      "(CASE WHEN name = 'a' THEN (TRUE) ELSE (FALSE) END)"   [:= {} venue-name "a"]
      "CASE WHEN name = 'a' THEN TRUE WHEN name = 'b' THEN TRUE ELSE FALSE END"
      [:or {} [:= {} venue-name "a"] [:= {} venue-name "b"]]
      "CASE WHEN name = 'a' THEN TRUE WHEN name = 'b' THEN FALSE WHEN name = 'c' THEN NULL ELSE FALSE END"
      [:= {} venue-name "a"]))
  (testing "inside AND, and in a WHEN even of a CASE under NOT, where only true counts, likewise"
    (are [sql clause] (= clause (condition "postgres" sql))
      "name > 'x' AND CASE WHEN name = 'a' THEN TRUE ELSE FALSE END"
      [:and {} [:> {} venue-name "x"] [:= {} venue-name "a"]]
      "NOT (CASE WHEN CASE WHEN name = 'a' THEN TRUE ELSE FALSE END THEN TRUE ELSE FALSE END)"
      [:not {} [:= {} [:case {} [[[:= {} venue-name "a"] true]] false] true]]))
  (testing (str "a TRUE after a FALSE or NULL branch, or in the ELSE, is the CASE = TRUE: the branch is taken when the"
                " conditions before it are false or null, and NOT over them would leave the null rows out")
    (are [sql clause] (= clause (condition "postgres" sql))
      "CASE WHEN name = 'a' THEN FALSE ELSE TRUE END"
      [:= {} [:case {} [[[:= {} venue-name "a"] false]] true] true]
      "CASE WHEN name = 'a' THEN NULL WHEN name = 'b' THEN TRUE END"
      [:= {} [:case {} [[[:= {} venue-name "a"] nil] [[:= {} venue-name "b"] true]]] true]
      "CASE WHEN name = 'a' THEN TRUE WHEN name = 'b' THEN FALSE ELSE TRUE END"
      [:= {} [:case {} [[[:= {} venue-name "a"] true] [[:= {} venue-name "b"] false]] true] true]))
  (testing "under NOT, where false and null differ, it is the CASE = TRUE too"
    (are [sql clause] (= clause (condition "postgres" sql))
      "NOT (CASE WHEN name = 'a' THEN TRUE ELSE FALSE END)"
      [:not {} [:= {} [:case {} [[[:= {} venue-name "a"] true]] false] true]]
      "NOT (name > 'x' OR CASE WHEN name = 'a' THEN TRUE END)"
      [:not {} [:or {} [:> {} venue-name "x"] [:= {} [:case {} [[[:= {} venue-name "a"] true]]] true]]]
      "NOT NOT (CASE WHEN name = 'a' THEN TRUE ELSE FALSE END)"
      [:not {} [:not {} [:= {} venue-name "a"]]]))
  (testing "the clauses compile to SQL that counts the rows the CASE does"
    (are [sql where] (= where (where-sql sql))
      "CASE WHEN name = 'a' THEN TRUE ELSE FALSE END" "name = ?"
      "CASE WHEN name = 'a' THEN FALSE ELSE TRUE END" "CASE WHEN name = ? THEN FALSE ELSE TRUE END = TRUE"))
  (testing "a CASE that is never true is reported"
    (are [sql] (= (str sql " is never true, so as a condition it matches no rows") (condition "postgres" sql))
      "CASE WHEN name = 'a' THEN FALSE ELSE FALSE END"
      "CASE WHEN name = 'a' THEN NULL END"))
  (testing "a CASE with another result, or a simple CASE, is still not a condition"
    (are [sql] (re-find #"\(Case\) is not supported as a condition" (condition "postgres" sql))
      "CASE WHEN name = 'a' THEN 1 ELSE 0 END"
      "CASE WHEN name = 'a' THEN TRUE ELSE name END"
      "CASE WHEN name = 'a' THEN 'true' ELSE FALSE END"
      "CASE name WHEN 'a' THEN TRUE ELSE FALSE END")))

(defn- resolve-date
  "A column callback that resolves each identifier to a date column of that name, so that a clause shows which
  argument went where."
  [identifier]
  [:field {:lib/uuid (str (random-uuid)), :base-type :type/Date, :effective-type :type/Date} identifier])

(defn- date-column
  "The ref [[resolve-date]] returns for `column-name`, without its uuid."
  [column-name]
  [:field {:base-type :type/Date, :effective-type :type/Date} column-name])

(defn- date-expression
  "The expression the SQL value expression `sql` converts to in `dialect` with [[resolve-date]], uuids removed; the
  reason when it is reported."
  [dialect sql]
  (reason #(without-uuids (sql-to-mbql.expression/expression->mbql dialect sql resolve-date))))

(def ^:private day-diff
  "`DATEDIFF(day, claim_open_date, claim_close_date)`, converted."
  [:datetime-diff {} (date-column "claim_open_date") (date-column "claim_close_date") :day])

(defn- part-diff
  "`part(claim_close_date) - part(claim_open_date)`, the Lib clause [[date-expression]] gives for a date part."
  [part]
  [:- {} [part {} (date-column "claim_close_date")] [part {} (date-column "claim_open_date")]])

(deftest ^:parallel datediff-test
  (testing "DATEDIFF(unit, start, end) is end - start, in each spelling of the dialects that have it"
    (are [dialect sql] (= day-diff (date-expression dialect sql))
      "snowflake" "DATEDIFF('day', claim_open_date, claim_close_date)"
      "snowflake" "datediff(day, claim_open_date, claim_close_date)"
      "snowflake" "DATEDIFF('days', claim_open_date, claim_close_date)"
      "snowflake" "TIMESTAMPDIFF(day, claim_open_date, claim_close_date)"
      "redshift"  "DATEDIFF('day', claim_open_date, claim_close_date)"
      "redshift"  "DATEDIFF(day, claim_open_date, claim_close_date)"
      "tsql"      "DATEDIFF(day, claim_open_date, claim_close_date)"
      "tsql"      "DATEDIFF(dd, claim_open_date, claim_close_date)"
      "bigquery"  "DATE_DIFF(claim_close_date, claim_open_date, DAY)"
      "mysql"     "DATEDIFF(claim_close_date, claim_open_date)"))
  (testing "a month, quarter or year is the number of boundaries between the two, as DATEDIFF counts them"
    (are [dialect sql] (= [:+ {} [:* {} (part-diff :get-year) 12] (part-diff :get-month)] (date-expression dialect sql))
      "snowflake" "DATEDIFF('month', claim_open_date, claim_close_date)"
      "snowflake" "DATEDIFF(mon, claim_open_date, claim_close_date)"
      "redshift"  "DATEDIFF(month, claim_open_date, claim_close_date)"
      "tsql"      "DATEDIFF(month, claim_open_date, claim_close_date)"
      "bigquery"  "DATE_DIFF(claim_close_date, claim_open_date, MONTH)")
    (is (= [:+ {} [:* {} (part-diff :get-year) 4] (part-diff :get-quarter)]
           (date-expression "snowflake" "DATEDIFF(quarter, claim_open_date, claim_close_date)")))
    (is (= (part-diff :get-year) (date-expression "snowflake" "DATEDIFF(year, claim_open_date, claim_close_date)"))))
  (testing "an hour, minute or second likewise, over the days between the two"
    (let [hours [:+ {} [:* {} day-diff 24] (part-diff :get-hour)]]
      (is (= hours (date-expression "snowflake" "DATEDIFF(hour, claim_open_date, claim_close_date)")))
      (is (= [:+ {} [:* {} [:+ {} [:* {} hours 60] (part-diff :get-minute)] 60] (part-diff :get-second)]
             (date-expression "snowflake" "DATEDIFF(second, claim_open_date, claim_close_date)")))))
  (testing "an argument that is an expression converts too"
    (is (= [:datetime-diff {} (date-column "claim_open_date") [:today {}] :day]
           (date-expression "snowflake" "DATEDIFF(day, claim_open_date, current_date)"))))
  (testing "a week, whose boundaries depend on the first day of the week, is reported, like extract(week)"
    (are [dialect sql] (re-find #"counts the week boundaries between .*, which depend on the first day of the week"
                                (date-expression dialect sql))
      "snowflake" "DATEDIFF(week, claim_open_date, claim_close_date)"
      "bigquery"  "DATE_DIFF(claim_close_date, claim_open_date, WEEK)"))
  (testing "a unit datetime-diff does not have is reported, naming it"
    (is (= "DATEDIFF in MILLISECOND is not supported"
           (date-expression "snowflake" "DATEDIFF(millisecond, claim_open_date, claim_close_date)"))))
  (testing (str "on a dialect whose DATEDIFF counts something else, or that has none, it is reported: on Postgres"
                " sqlglot reads DATEDIFF(unit, start, end) with the arguments in another order")
    (are [dialect] (re-find #"^the function datediff is not supported on .*, only on Snowflake, Redshift"
                            (date-expression dialect "DATEDIFF('day', claim_open_date, claim_close_date)"))
      "postgres" "trino" "databricks" nil)))

(deftest ^:parallel unsupported-test
  (testing "what does not convert throws an exception unsupported? recognises, and no other exception is one"
    (is (sql-to-mbql.expression/unsupported?
         (try
           (sql-to-mbql.expression/expression->mbql "postgres" "greatest(name, 'a')" resolve-name)
           (catch clojure.lang.ExceptionInfo e
             e))))
    (is (not (sql-to-mbql.expression/unsupported? (ex-info "boom" {}))))
    (is (not (sql-to-mbql.expression/unsupported? (Exception. "boom")))))
  (testing "an exception the column callback throws propagates as it is"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^boom$"
                          (sql-to-mbql.expression/expression->mbql "postgres" "name"
                                                                   (fn [_identifier] (throw (ex-info "boom" {}))))))))
