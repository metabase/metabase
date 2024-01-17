(ns metabase.driver.sql.util
  "Utility functions for writing SQL drivers."
  (:require
   [clojure.string :as str]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (com.github.vertical_blank.sqlformatter SqlFormatter SqlFormatter$Formatter)
   (com.github.vertical_blank.sqlformatter.core DialectConfig)
   (com.github.vertical_blank.sqlformatter.languages Dialect)))

(set! *warn-on-reflection* true)

(mu/defn quote-name
  "Quote unqualified string or keyword identifier(s) by passing them to `h2x/identifier`, then calling HoneySQL `format`
  on the resulting `Identifier`. Uses the `sql.qp/quote-style` of the current driver. You can implement `->honeysql`
  for `Identifier` if you need custom behavior here.

    (quote-name :mysql :field \"wow\") ; -> \"`wow`\"
    (quote-name :h2    :field \"wow\") ; -> \"\\\"WOW\\\"\"

  You should only use this function for places where you are not using HoneySQL, such as queries written directly in
  SQL. For HoneySQL forms, `Identifier` is converted to SQL automatically when it is compiled."
  [driver          :- :keyword
   identifier-type :- h2x/IdentifierType
   & components]
  (first
   (sql.qp/format-honeysql driver (apply h2x/identifier identifier-type components))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Deduplicate Field Aliases                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn ^:private increment-identifier-string :- :string
  [last-component :- :string]
  (if-let [[_ existing-suffix] (re-find #"^.*_(\d+$)" last-component)]
    ;; if last-component already has an alias like col_2 then increment it to col_3
    (let [new-suffix (str (inc (Integer/parseInt existing-suffix)))]
      (str/replace last-component (re-pattern (str existing-suffix \$)) new-suffix))
    ;; otherwise just stick a _2 on the end so it's col_2
    (str last-component "_2")))

(mu/defn ^:private increment-identifier
  "Add an appropriate suffix to a keyword `identifier` to make it distinct from previous usages of the same identifier,
  e.g.

     (increment-identifier :my_col)   ; -> :my_col_2
     (increment-identifier :my_col_2) ; -> :my_col_3"
  [[_tag identifier-type components] :- h2x/Identifier]
  (let [components' (concat
                     (butlast components)
                     [(increment-identifier-string (u/qualified-name (last components)))])]
    (apply h2x/identifier identifier-type components')))

(defn select-clause-alias-everything
  "Make sure all the columns in `select-clause` are alias forms, e.g. `[:table.col :col]` instead of `:table.col`.
  (This facilitates our deduplication logic.)"
  [select-clause]
  (for [col select-clause]
    (cond
      ;; if something's already an alias form like [:table.col :col] it's g2g
      (and (sequential? col)
           (not (h2x/identifier? col)))
      col

      ;; otherwise we *should* be dealing with an Identifier. If so, take the last component of the Identifier and use
      ;; that as the alias.
      ;;
      ;; TODO - could this be done using `->honeysql` or `field->alias` instead?
      (h2x/identifier? col)
      (let [[_tag _identifier-type components] col]
        [col (h2x/identifier :field-alias (last components))])

      :else
      (do
        (log/errorf "Don't know how to alias %s, expected an h2x/identifier" (pr-str col))
        [col col]))))

(defn select-clause-deduplicate-aliases
  "Make sure every column in `select-clause` has a unique alias. This is useful for databases like Oracle that can't
  figure out how to use a query that produces duplicate columns in a subselect."
  [select-clause]
  (if (= select-clause [:*])
    ;; if we're doing `SELECT *` there's no way we can deduplicate anything so we're SOL, return as-is
    select-clause
    ;; otherwise we can actually deduplicate things
    (loop [already-seen #{}, acc [], [[col alias] & more] (select-clause-alias-everything select-clause)]
      (cond
        ;; if not more cols are left to deduplicate, we're done
        (not col)
        acc

        ;; otherwise if we've already used this alias, replace it with one like `identifier_2` and try agan
        (contains? already-seen alias)
        (recur already-seen acc (cons [col (increment-identifier alias)]
                                      more))

        ;; otherwise if we haven't seen it record it as seen and move on to the next column
        :else
        (recur (conj already-seen alias) (conj acc [col alias]) more)))))

(defn escape-sql
  "Escape single quotes in a SQL string. `escape-style` is either `:ansi` (escape a single quote with two single quotes)
  or `:backslashes` (escape a single quote with a backslash).

    (escape-sql \"Tito's Tacos\" :ansi)        ; -> \"Tito''s Tacos\"
    (escape-sql \"Tito's Tacos\" :backslashes) ; -> \"Tito\\'s Tacos\"

  !!!! VERY IMPORTANT !!!!

  DON'T RELY ON THIS FOR SANITIZING USER INPUT BEFORE RUNNING QUERIES!

  For user input, *ALWAYS* pass parameters separately (e.g. using `?` in the SQL) where supported, or if unsupported,
  encode the strings as hex and splice in something along the lines of `utf8_string(hex_decode(<hex-string>))`
  instead. This is intended only for escaping trusted strings, or for generating the SQL equivalent version of an MBQL
  query for debugging purposes or powering the 'convert to SQL' feature."
  {:arglists '([s :ansi] [s :backslashes])}
  ^String [^String s escape-style]
  (when s
    (case escape-style
      :ansi        (str/replace s "'" "''")
      :backslashes (-> s
                       (str/replace "\\" "\\\\")
                       (str/replace "'" "\\'")))))

(defn validate-convert-timezone-args
  "Validate the arguments of convert-timezone.
  - if input column has timezone only target-timezone is required, throw exception if source-timezone is provided.
  - if input column doesn't have a timezone both target-timezone and source-timezone are required."
  [has-timezone? target-timezone source-timezone]
  (when (and has-timezone? source-timezone)
      (throw (ex-info (tru "input column already has a set timezone. Please remove the source parameter in convertTimezone.")
                      {:type            qp.error-type/invalid-query
                       :target-timezone target-timezone
                       :source-timezone source-timezone})))
  (when (and (not has-timezone?) (not source-timezone))
    (throw (ex-info (tru "input column doesn't have a set timezone. Please set the source parameter in convertTimezone to convert it.")
                    {:type            qp.error-type/invalid-query
                     :target-timezone target-timezone
                     :source-timezone source-timezone}))))

(defn fix-sql-params
  "[[format-sql]] will expand parameterized values (e.g. {{#123}} -> { { # 123 } }).
  This function fixes that by removing whitespace from matching double-curly brace substrings."
  [sql]
  (when (string? sql)
    (let [rgx #"\{\s*\{\s*[^\}]+\s*\}\s*\}"]
      (str/replace sql rgx (fn [match] (str/replace match #"\s*" ""))))))

(def dialects
  "Mapping of dialect kw to dialect, used by sql formatter in [[format-sql]], to dialect."
  {:db2         Dialect/Db2
   :mariadb     Dialect/MariaDb
   :mysql       Dialect/MySql
   :n1ql        Dialect/N1ql
   :plsql       Dialect/PlSql
   :postgres    Dialect/PostgreSql
   :redshift    Dialect/Redshift
   :sparksql    Dialect/SparkSql
   :standardsql Dialect/StandardSql
   :tsql        Dialect/TSql})

(def ^:private ^java.util.List additional-operators
  ["#>>" "!="])

(defn- add-operators
  ^SqlFormatter$Formatter [^SqlFormatter$Formatter formatter]
  (.extend formatter (reify java.util.function.UnaryOperator
                       (apply [_this config]
                         (.plusOperators ^DialectConfig config additional-operators)))))

(defn format-sql
  "Pretty format `sql` string using appropriate `dialect`.
  `dialect` is derived from `driver-or-dialect-kw`. If there is no corresponding value in [[dialects]]. fallback to
  `Dialect/StandardSql`. For more details see the [[metabase.driver/prettify-native-form]]."
  [driver-or-dialect-kw sql]
  (when (string? sql)
    (let [dialect (get dialects driver-or-dialect-kw Dialect/StandardSql)
          formatter (add-operators (SqlFormatter/of ^Dialect dialect))]
      (.format formatter ^String sql))))

(defn format-sql-and-fix-params
  "[[format-sql]] and [[fix-sql-params]] afterwards. For details see those functions."
  [driver-or-dialect-kw sql]
  (-> (format-sql driver-or-dialect-kw sql) fix-sql-params))
