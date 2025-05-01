(ns metabase.driver.sql.query-processor.boolean-is-comparison
  "In Oracle and some other databases, boolean literals cannot appear in the top-level of WHERE clauses or expressions
  like AND, OR, NOT, and CASE. These instead require a comparison operator, so boolean constants like 0 and 1 must be
  replaced with equivalent expressions like 1 = 1 or 0 = 1.

  Drivers can derive from this abstract driver to use an alternate implementation(s) of SQL QP method(s) that treat
  boolean literals as comparison expressions in filter clauses and logical operators."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]))

;; Oracle and SQLServer (and maybe others) use 0 and 1 for boolean constants, but, for example, none of the following
;; queries are valid in such databases:
;;
;; - SELECT 1 WHERE 1
;; - SELECT 1 WHERE 1 AND 1
;; - SELECT 1 WHERE 0 OR 1
;;
;; But these are:
;;
;; - SELECT 1 WHERE (1 = 1)
;; - SELECT 1 WHERE (1 = 1) AND (1 = 1)
;; - SELECT 1 WHERE (0 = 1) OR  (1 = 1)
;;
;; At the same time, we can't simply override the `->honeysql` method for Boolean, because in some contexts the boolean
;; constants are required. For example in SQLServer `SELECT (1 = 1) AS MyTrue ...` is invalid, but `SELECT
;; 1 AS MyTrue ...` is OK.
;;
;; https://learn.microsoft.com/en-us/sql/t-sql/data-types/constants-transact-sql#boolean-constants
;; https://learn.microsoft.com/en-us/sql/t-sql/language-elements/comparison-operators-transact-sql#boolean-data-type
;; https://learn.microsoft.com/en-us/sql/t-sql/language-elements/and-transact-sql
;;
;; https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/About-SQL-Conditions.html#GUID-E9EC8434-CD48-4C01-B01B-85E5359D8DD7
;; https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Data-Types.html#GUID-285FFCA8-390D-4FA9-9A51-47B84EF5F83A
;; https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Logical-Conditions.html
(driver/register! ::boolean-is-comparison, :abstract? true)

(defn- boolean->comparison
  "Convert boolean literals to equivalent boolean comparison expressions.

  Both the input `value` and the output of this function should be compiled honeysql forms."
  [driver value]

  (let [false-value (sql.qp/->honeysql driver false)
        true-value  (sql.qp/->honeysql driver true)]
    (condp = value
      true-value  [:= true-value  true-value]
      false-value [:= false-value true-value]
      value)))

(defmethod sql.qp/apply-top-level-clause [::boolean-is-comparison :filter]
  [driver _ honeysql-form {clause :filter}]
  (sql.helpers/where honeysql-form (->> (sql.qp/->honeysql driver clause)
                                        (boolean->comparison driver))))

(prefer-method sql.qp/apply-top-level-clause [::boolean-is-comparison :filter] [:sql :filter])

(defn- compile-logical-op [driver [tag & _ :as clause]]
  (let [parent-method (get-method sql.qp/->honeysql [:sql tag])]
    (->> (parent-method driver clause)
         (mapv (partial boolean->comparison driver)))))

(defmethod sql.qp/->honeysql [::boolean-is-comparison :and]
  [driver clause]
  (compile-logical-op driver clause))

(defmethod sql.qp/->honeysql [::boolean-is-comparison :or]
  [driver clause]
  (compile-logical-op driver clause))

(defmethod sql.qp/->honeysql [::boolean-is-comparison :not]
  [driver clause]
  (compile-logical-op driver clause))

;; The following expressions compile down to :case and should therefore also
;; work: :if, :sum-where, :count-where, :distinct-where.
(defmethod sql.qp/->honeysql [::boolean-is-comparison :case]
  [driver clause]
  (let [parent-method (get-method sql.qp/->honeysql [:sql :case])
        bool->comp (partial boolean->comparison driver)]
    (->> (parent-method driver clause)
         ;; case clauses look like [:case cond1 body1 ... [:else default]]. Only the condN forms at
         ;; odd indices need to be translated.
         (map-indexed #(cond-> %2
                         (odd? %1) bool->comp)))))

(doseq [tag [:and :or :not :case]]
  (prefer-method sql.qp/->honeysql [::boolean-is-comparison tag] [:sql tag]))
