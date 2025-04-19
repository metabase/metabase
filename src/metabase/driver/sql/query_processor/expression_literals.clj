(ns metabase.driver.sql.query-processor.expression-literals
  "TODO: write me

  Drivers can derive from this abstract driver to use an alternate implementation(s) of SQL QP method(s) that treat
  boolean literals as comparison expressions in filter clauses."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]))

(driver/register! ::boolean->comparison, :abstract? true)

(defn- boolean->comparison
  "Convert boolean literals to equivalent boolean comparison expressions."
  [driver value]
  ;; Use this function to convert literal boolean values to an equivalent boolean expression in filter clauses.
  ;;
  ;; For example, SQLServer uses 0 and 1 for boolean constants, but these constants are not allowed in the top level
  ;; of a WHERE clause or AND or OR expressions. Those clauses expect a comparison operator. For example, none of the
  ;; following queries are valid:
  ;;
  ;; - SELECT 1 WHERE 1
  ;; - SELECT 1 WHERE 1 AND 1
  ;; - SELECT 1 WHERE 0 OR 1
  ;;
  ;; But these are
  ;;
  ;; - SELECT 1 WHERE (1 = 1)
  ;; - SELECT 1 WHERE (1 = 1) AND (1 = 1)
  ;; - SELECT 1 WHERE (0 = 1) OR  (1 = 1)
  ;;
  ;; https://learn.microsoft.com/en-us/sql/t-sql/data-types/constants-transact-sql#boolean-constants
  ;; https://learn.microsoft.com/en-us/sql/t-sql/language-elements/comparison-operators-transact-sql#boolean-data-type
  ;; https://learn.microsoft.com/en-us/sql/t-sql/language-elements/and-transact-sql
  ;;
  ;; https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/About-SQL-Conditions.html#GUID-E9EC8434-CD48-4C01-B01B-85E5359D8DD7
  ;; https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Data-Types.html#GUID-285FFCA8-390D-4FA9-9A51-47B84EF5F83A
  ;; https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Logical-Conditions.html
  (let [false-value (sql.qp/->honeysql driver false)
        true-value  (sql.qp/->honeysql driver true)]
    (condp = value
      true-value  [:= true-value  true-value]
      false-value [:= false-value true-value]
      value)))

(defmethod sql.qp/apply-top-level-clause [::boolean->comparison :filter]
  [driver _ honeysql-form {clause :filter}]
  (sql.helpers/where honeysql-form (->> (sql.qp/->honeysql driver clause)
                                        (boolean->comparison driver))))

(prefer-method sql.qp/apply-top-level-clause [::boolean->comparison :filter] [:sql :filter])

(defn- compile-logical-op [driver [tag & _ :as clause]]
  (let [parent-method (get-method sql.qp/->honeysql [:sql tag])]
    (->> (parent-method driver clause)
         (mapv (partial boolean->comparison driver)))))

(defmethod sql.qp/->honeysql [::boolean->comparison :and]
  [driver clause]
  (compile-logical-op driver clause))

(defmethod sql.qp/->honeysql [::boolean->comparison :or]
  [driver clause]
  (compile-logical-op driver clause))

(defmethod sql.qp/->honeysql [::boolean->comparison :not]
  [driver clause]
  (compile-logical-op driver clause))

(doseq [tag [:and :or :not]]
  (prefer-method sql.qp/->honeysql [::boolean->comparison tag] [:sql tag]))
