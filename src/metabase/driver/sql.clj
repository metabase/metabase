(ns metabase.driver.sql
  "Shared code for all drivers that use SQL under the hood."
  (:require [honeysql.core :as hsql]
            [metabase.driver :as driver]
            [metabase.driver.sql.query-processor :as sql.qp]
            [schema.core :as s])
  (:import clojure.lang.Keyword
           honeysql.types.SqlCall
           java.util.Date))

(driver/register! :sql, :abstract? true)

(defmethod driver/supports? [:sql :standard-deviation-aggregations] [_ _] true)
(defmethod driver/supports? [:sql :foreign-keys]                    [_ _] true)
(defmethod driver/supports? [:sql :expressions]                     [_ _] true)
(defmethod driver/supports? [:sql :expression-aggregations]         [_ _] true)
(defmethod driver/supports? [:sql :native-parameters]               [_ _] true)
(defmethod driver/supports? [:sql :nested-queries]                  [_ _] true)
(defmethod driver/supports? [:sql :binning]                         [_ _] true)

(defmethod driver/mbql->native :sql [driver query]
  (sql.qp/mbql->native driver query))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      ->prepared-substitution Multimethod                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti ->prepared-substitution
  "Returns a `PreparedStatementSubstitution` for `x` and the given driver. This allows driver specific parameters and
  SQL replacement text (usually just ?). The param value is already prepared and ready for inlcusion in the query,
  such as what's needed for SQLite and timestamps."
  {:arglists '([driver x])}
  (fn [driver x] [(driver/dispatch-on-initialized-driver driver) (class x)])
  :hierarchy #'driver/hierarchy)


(def PreparedStatementSubstitution
  "Represents the SQL string replace value (usually ?) and the typed parameter value"
  {:sql-string   s/Str
   :param-values [s/Any]})

(s/defn make-stmt-subs :- PreparedStatementSubstitution
  "Create a `PreparedStatementSubstitution` map for `sql-string` and the `param-seq`"
  [sql-string param-seq]
  {:sql-string   sql-string
   :param-values param-seq})

(s/defn ^:private honeysql->prepared-stmt-subs
  "Convert X to a replacement snippet info map by passing it to HoneySQL's `format` function."
  [driver x]
  (let [[snippet & args] (hsql/format x, :quoting (sql.qp/quote-style driver), :allow-dashed-names? true)]
    (make-stmt-subs snippet args)))

(s/defmethod ->prepared-substitution [:sql nil] :- PreparedStatementSubstitution
  [driver _]
  (honeysql->prepared-stmt-subs driver nil))

(s/defmethod ->prepared-substitution [:sql Object] :- PreparedStatementSubstitution
  [driver obj]
  (honeysql->prepared-stmt-subs driver (str obj)))

(s/defmethod ->prepared-substitution [:sql Number] :- PreparedStatementSubstitution
  [driver num]
  (honeysql->prepared-stmt-subs driver num))

(s/defmethod ->prepared-substitution [:sql Boolean] :- PreparedStatementSubstitution
  [driver b]
  (honeysql->prepared-stmt-subs driver b))

(s/defmethod ->prepared-substitution [:sql Keyword] :- PreparedStatementSubstitution
  [driver kwd]
  (honeysql->prepared-stmt-subs driver kwd))

(s/defmethod ->prepared-substitution [:sql SqlCall] :- PreparedStatementSubstitution
  [driver sql-call]
  (honeysql->prepared-stmt-subs driver sql-call))

(s/defmethod ->prepared-substitution [:sql Date] :- PreparedStatementSubstitution
  [driver date]
  (make-stmt-subs "?" [date]))
