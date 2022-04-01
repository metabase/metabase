(ns metabase.driver.sql.util
  "Utility functions for writing SQL drivers."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honey.sql :as hsql]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s]))

(defn format-expr
  "Call [[honey.sql/format-expr]] with appropriate dynamic variables bound for `driver`."
  [driver honeysql-form]
  (binding [hsql/*dialect*      (#'hsql/dialects (sql.qp/honeysql-dialect driver))
            hsql/*quoted*       true
            hsql/*quoted-snake* false]
    (hsql/format-expr honeysql-form)))

(s/defn quote-name
  "Quote unqualified string or keyword identifier(s) by passing them to [[hx/identifier]], then
  calling [[honey.sql/format-expr]] on the resulting `::hx/identifier`. Uses the [[sql.qp/honeysql-dialect]] of the
  current driver. You can implement [[sql.qp/->honeysql]] for `::hx/identifier` if you need custom behavior here.

    (quote-name :mysql \"wow\") ; -> \"`wow`\"
    (quote-name :h2 \"wow\")    ; -> \"\\\"WOW\\\"\"

  You should only use this function for places where you are not using HoneySQL, such as queries written directly in
  SQL. For HoneySQL forms, the `::hx/identifier` is converted to SQL automatically when it is compiled."
  [driver :- s/Keyword identifier-type :- hx/IdentifierType & components]
  (let [honeysql-form (sql.qp/->honeysql driver (apply hx/identifier identifier-type components))]
    (first (format-expr driver honeysql-form))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Deduplicate Field Aliases                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private increment-identifier-string :- s/Str
  [last-component :- s/Str]
  (if-let [[_ existing-suffix] (re-find #"^.*_(\d+$)" last-component)]
    ;; if last-component already has an alias like col_2 then increment it to col_3
    (let [new-suffix (str (inc (Integer/parseInt existing-suffix)))]
      (str/replace last-component (re-pattern (str existing-suffix \$)) new-suffix))
    ;; otherwise just stick a _2 on the end so it's col_2
    (str last-component "_2")))

(s/defn ^:private increment-identifier :- hx/Identifier
  "Add an appropriate suffix to a keyword `identifier` to make it distinct from previous usages of the same identifier,
  e.g.

     (increment-identifier :my_col)   ; -> :my_col_2
     (increment-identifier :my_col_2) ; -> :my_col_3"
  [identifier :- hx/Identifier]
  (apply
   hx/identifier
   (hx/identifier-type identifier)
   (let [components (hx/identifier-components identifier)]
     (conj
      (vec (butlast components))
      (increment-identifier-string (u/qualified-name (last components)))))))

(defn select-clause-alias-everything
  "Make sure all the columns in `select-clause` are alias forms, e.g. `[:table.col :col]` instead of `:table.col`.
  (This faciliates our deduplication logic.)"
  [select-clause]
  (for [col select-clause]
    (cond
      ;; if something's already an alias form like [:table.col :col] it's g2g
      (sequential? col)
      col

      ;; otherwise we *should* be dealing with an Identifier. If so, take the last component of the Identifier and use
      ;; that as the alias.
      ;;
      ;; TODO - could this be done using `->honeysql` or `field->alias` instead?
      (hx/identifier? col)
      [col (hx/identifier :field-alias (last (hx/identifier-components col)))]

      :else
      (do
        (log/error (trs "Don''t know how to alias {0}, expected an Identifier." col))
        [col col]))))

;; TODO -- I'm 95% sure this isn't actually needed anymore now that we're doing all the stuff in
;; [[metabase.query-processor.util.add-alias-info]]. This is only used in [[metabase.driver.oracle]] at any rate.
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
