(ns metabase-enterprise.semantic-layer-import.sql
  "The import's side of the warehouse SQL in the IR, which [[metabase.sql-to-mbql.core]] converts to Lib expressions
  and filter clauses: what an IR `expr` is ([[parse-expr]], [[column-name]]), the parts of a relation's dotted name as
  a source spells it ([[relation-parts]]), whether SQL still contains Jinja ([[jinja?]]), and
  [[value->mbql]], [[condition->mbql]] and [[aggregation->mbql]], the conversions with what they cannot convert thrown
  with [[unsupported/throw-reason]], which the resolve stage turns into a report entry. See [SQL in the IR](sql.md)."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-layer-import.unsupported :as unsupported]
   [metabase.sql-to-mbql.core :as sql-to-mbql]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (clojure.lang ExceptionInfo)))

(def ^:private identifier-re
  "A bare column name, optionally table-qualified. Each part is either quoted (`\"Sales\"`, `` `sales` ``, `[Sales]`) or
  a run of letters, digits and underscores in any script that is not all digits (so `1.0` is not table `1`, column
  `0`); a leading digit is legal in a warehouse when quoted, and projects write it unquoted in an `expr`. Surrounding
  whitespace, including the newline a YAML block scalar adds, is ignored."
  (let [bare "(?=[\\p{L}\\p{N}_]*[\\p{L}_])[\\p{L}\\p{N}_]+"]
    (re-pattern (str "(?s)^\\s*"
                     "(?:(?:\"[^\"]+\"|`[^`]+`|\\[[^\\]]+\\]|" bare ")\\s*\\.\\s*)?"
                     "(?:\"([^\"]+)\"|`([^`]+)`|\\[([^\\]]+)\\]|(" bare "))"
                     "\\s*$"))))

(def ^:private integer-literal-re #"(?s)^\s*\d+\s*$")
(def ^:private keyword-literal-re #"(?is)^\s*(?:true|false|null)\s*$")
(def ^:private wildcard-re #"(?s)^\s*\*\s*$")

(mr/def ::parsed-expr
  "What an IR `expr` is, see [[parse-expr]]."
  [:map {:closed true}
   [:kind    [:enum :column :literal :wildcard :sql]]
   [:name    {:optional true} :string]
   [:quoted? {:optional true} :boolean]
   [:value   {:optional true} :string]])

(mu/defn parse-expr :- ::parsed-expr
  "What an IR `expr` is: a bare column name (`:name`, unquoted and unqualified, with `:quoted?` saying whether the
  column part was written in quotes, so the warehouse kept its spelling), a literal (`:value`, as written, so the
  report can quote it), the wildcard `*`, or anything else, which is SQL."
  [expr :- :string]
  (cond
    (re-matches wildcard-re expr)
    {:kind :wildcard}

    (or (re-matches integer-literal-re expr)
        (re-matches keyword-literal-re expr))
    {:kind :literal, :value (str/trim expr)}

    :else
    (if-let [[_ quoted backticked bracketed bare] (re-matches identifier-re expr)]
      {:kind    :column
       :name    (or quoted backticked bracketed bare)
       :quoted? (boolean (or quoted backticked bracketed))}
      {:kind :sql})))

(mu/defn column-name :- [:maybe :string]
  "The column `expr` names when it is a bare column name (see [[parse-expr]]); nil for a literal, the wildcard or SQL,
  which an implicit join has no use for: it needs a column on each side."
  [expr :- :string]
  (let [{:keys [kind], the-name :name} (parse-expr expr)]
    (when (= kind :column)
      the-name)))

(def ^:private relation-part-re
  "One part of a relation's dotted name, with the dot after it when there is one: in double quotes (`\"dbt_bi\"`,
  Postgres, Snowflake, Redshift, Oracle, Trino), in backticks (`` `dbt_bi` ``, MySQL, BigQuery, Spark, Databricks,
  Hive), in square brackets (`[dbt_bi]`, SQL Server) or bare (`dbt_bi`), a bare part being anything but a dot, a
  quote, a bracket or whitespace. A closing quote doubled inside a quoted part stands for itself. The groups, in that
  order, say how the part was quoted."
  #"(?:\"((?:[^\"]|\"\")*)\"|`((?:[^`]|``)*)`|\[((?:[^\]]|\]\])*)\]|([^.\"`\[\]\s]+))\.?")

(def ^:private backticked-path-re
  "BigQuery's way of quoting a whole dotted path in one pair of backticks, `` `project.dataset.table` ``: a lone
  backticked part with a dot in it."
  #"`([^`]*\.[^`]*)`")

(mr/def ::relation-part
  "One part of a relation's dotted name, and whether it was written in quotes."
  [:map {:closed true}
   [:name    :string]
   [:quoted? :boolean]])

(mu/defn relation-parts :- [:maybe [:sequential ::relation-part]]
  "The parts of `relation-name`, a dotted name (`\"dbt_bi\".\"public\".\"fact_sales\"`, `analytics.orders`, `` `db`.`t`
  ``), in order, each with its quotes stripped (a doubled closing quote undoubled) and whether it had any, surrounding
  whitespace ignored. A lone backticked part with dots in it is BigQuery's one-quoted path, `` `proj.ds.tbl` ``, and is
  split at the dots, each part quoted. Nil when the name is not a dotted name of non-empty parts: a query, an empty
  string, two dots in a row."
  [relation-name :- :string]
  (let [trimmed (str/trim relation-name)]
    (if-let [[_ path] (re-matches backticked-path-re trimmed)]
      (let [parts (str/split path #"\." -1)]
        (when (every? seq parts)
          (mapv (fn [part] {:name part, :quoted? true}) parts)))
      (let [matches (re-seq relation-part-re trimmed)]
        (when (and (seq matches)
                   (= trimmed (apply str (map first matches))))
          (mapv (fn [[_ double-quoted backticked bracketed bare]]
                  (cond
                    double-quoted {:name (str/replace double-quoted "\"\"" "\""), :quoted? true}
                    backticked    {:name (str/replace backticked "``" "`"), :quoted? true}
                    bracketed     {:name (str/replace bracketed "]]" "]"), :quoted? true}
                    :else         {:name bare, :quoted? false}))
                matches))))))

(mu/defn jinja? :- :boolean
  "Does `sql` still contain Jinja: an expression `{{`, a statement `{%` or a comment `{#`? Inside a string literal
  too: a tool that templates its SQL renders it before the warehouse sees it, so `'{{ var(\"x\") }}'` is not the
  literal text."
  [sql :- :string]
  (boolean (re-find #"\{\{|\{%|\{#" sql)))

(mu/defn- convert :- ::sql-to-mbql/expression
  "`(->mbql dialect sql resolve-column)`, `->mbql` one of the converter's functions ([[sql-to-mbql/value->mbql]],
  [[sql-to-mbql/condition->mbql]] or [[sql-to-mbql/aggregation->mbql]]), for the SQL in the IR. SQL that still
  contains Jinja (see [[jinja?]]) and SQL the converter cannot convert are thrown with [[unsupported/throw-reason]]. An
  exception `resolve-column` throws, an unsupported reason of the import's own among them, propagates as it is."
  [->mbql         :- ifn?
   dialect        :- ::sql-to-mbql/dialect
   sql            :- :string
   resolve-column :- ::sql-to-mbql/resolve-column]
  ;; sqlglot reads `{{ ... }}` as a struct literal, so catch Jinja the filter renderer did not recognise first
  (when (jinja? sql)
    (unsupported/throw-reason "could not parse %s: it still contains Jinja" (pr-str sql)))
  (try
    (->mbql dialect sql resolve-column)
    (catch ExceptionInfo e
      (if (sql-to-mbql/unsupported? e)
        (unsupported/throw-reason (ex-message e))
        (throw e)))))

(mu/defn value->mbql :- ::sql-to-mbql/expression
  "[[sql-to-mbql/value->mbql]] for the SQL of an IR aggregation's, dimension's or key's `expr`, or a derived metric's
  arithmetic, in `dialect`; see [[convert]] for what is thrown."
  [dialect        :- ::sql-to-mbql/dialect
   sql            :- :string
   resolve-column :- ::sql-to-mbql/resolve-column]
  (convert sql-to-mbql/value->mbql dialect sql resolve-column))

(mu/defn condition->mbql :- ::sql-to-mbql/condition
  "[[sql-to-mbql/condition->mbql]] for the SQL of an IR filter, or of a `:count-where` aggregation's `expr`, in
  `dialect`; see [[convert]] for what is thrown."
  [dialect        :- ::sql-to-mbql/dialect
   sql            :- :string
   resolve-column :- ::sql-to-mbql/resolve-column]
  (convert sql-to-mbql/condition->mbql dialect sql resolve-column))

(mu/defn aggregation->mbql :- ::sql-to-mbql/aggregation
  "[[sql-to-mbql/aggregation->mbql]] for the SQL of an IR aggregation written as a whole aggregate expression, a
  semantic layer's metric, in `dialect`; see [[convert]] for what is thrown."
  [dialect        :- ::sql-to-mbql/dialect
   sql            :- :string
   resolve-column :- ::sql-to-mbql/resolve-column]
  (convert sql-to-mbql/aggregation->mbql dialect sql resolve-column))
