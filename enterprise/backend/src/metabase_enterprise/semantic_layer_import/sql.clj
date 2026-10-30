(ns metabase-enterprise.semantic-layer-import.sql
  "The import's side of the warehouse SQL in the IR, which [[metabase.sql-to-mbql.core]] converts to Lib expressions
  and filter clauses: what an IR `expr` is ([[parse-expr]]), whether SQL still contains Jinja ([[jinja?]]), and
  [[expression->mbql]], the conversion with what it cannot convert thrown with [[unsupported/throw-reason]], which the
  resolve stage turns into a report entry. See [SQL in the IR](sql.md)."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-layer-import.unsupported :as unsupported]
   [metabase.sql-to-mbql.core :as sql-to-mbql]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (clojure.lang ExceptionInfo)))

(def ^:private identifier-re
  "A bare column name, optionally table-qualified. Each part is either quoted (`\"Sales\"`, `` `sales` ``) or a run of
  letters, digits and underscores in any script that is not all digits (so `1.0` is not table `1`, column `0`); a
  leading digit is legal in a warehouse when quoted, and projects write it unquoted in an `expr`. Surrounding
  whitespace, including the newline a YAML block scalar adds, is ignored."
  (let [bare "(?=[\\p{L}\\p{N}_]*[\\p{L}_])[\\p{L}\\p{N}_]+"]
    (re-pattern (str "(?s)^\\s*"
                     "(?:(?:\"[^\"]+\"|`[^`]+`|" bare ")\\s*\\.\\s*)?"
                     "(?:\"([^\"]+)\"|`([^`]+)`|(" bare "))"
                     "\\s*$"))))

(def ^:private integer-literal-re #"(?s)^\s*\d+\s*$")
(def ^:private keyword-literal-re #"(?is)^\s*(?:true|false|null)\s*$")
(def ^:private wildcard-re #"(?s)^\s*\*\s*$")

(mr/def ::parsed-expr
  "What an IR `expr` is, see [[parse-expr]]."
  [:map {:closed true}
   [:kind  [:enum :column :literal :wildcard :sql]]
   [:name  {:optional true} :string]
   [:value {:optional true} :string]])

(mu/defn parse-expr :- ::parsed-expr
  "What an IR `expr` is: a bare column name (`:name`, unquoted and unqualified), a literal (`:value`, as written, so
  the report can quote it), the wildcard `*`, or anything else, which is SQL."
  [expr :- :string]
  (cond
    (re-matches wildcard-re expr)
    {:kind :wildcard}

    (or (re-matches integer-literal-re expr)
        (re-matches keyword-literal-re expr))
    {:kind :literal, :value (str/trim expr)}

    :else
    (if-let [[_ quoted backticked bare] (re-matches identifier-re expr)]
      {:kind :column, :name (or quoted backticked bare)}
      {:kind :sql})))

(mu/defn jinja? :- :boolean
  "Does `sql` still contain Jinja: an expression `{{`, a statement `{%` or a comment `{#`? Inside a string literal
  too: a tool that templates its SQL renders it before the warehouse sees it, so `'{{ var(\"x\") }}'` is not the
  literal text."
  [sql :- :string]
  (boolean (re-find #"\{\{|\{%|\{#" sql)))

(mu/defn expression->mbql :- ::sql-to-mbql/expression
  "[[sql-to-mbql/expression->mbql]] for the SQL of an IR aggregation's, dimension's or key's `expr`, a derived metric's
  arithmetic or a filter, in `dialect`, with `options` passed on. SQL that still contains Jinja (see [[jinja?]]) and
  SQL the converter cannot convert are thrown with [[unsupported/throw-reason]]. An exception `resolve-column` throws,
  an unsupported reason of the import's own among them, propagates as it is."
  ([dialect        :- ::sql-to-mbql/dialect
    sql            :- :string
    resolve-column :- ::sql-to-mbql/resolve-column]
   (expression->mbql dialect sql resolve-column nil))

  ([dialect        :- ::sql-to-mbql/dialect
    sql            :- :string
    resolve-column :- ::sql-to-mbql/resolve-column
    options        :- ::sql-to-mbql/options]
   ;; sqlglot reads `{{ ... }}` as a struct literal, so catch Jinja the filter renderer did not recognise first
   (when (jinja? sql)
     (unsupported/throw-reason "could not parse %s: it still contains Jinja" (pr-str sql)))
   (try
     (sql-to-mbql/expression->mbql dialect sql resolve-column options)
     (catch ExceptionInfo e
       (if (sql-to-mbql/unsupported? e)
         (unsupported/throw-reason (ex-message e))
         (throw e))))))
