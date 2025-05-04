(ns metabase.driver.sql.query-processor.boolean-is-comparison
  "In Oracle and some other databases, boolean literals cannot appear in the top-level of WHERE clauses or expressions
  like AND, OR, NOT, and CASE. These instead require a comparison operator, so boolean constants like 0 and 1 must be
  replaced with equivalent expressions like 1 = 1 or 0 = 1.

  Drivers can derive from this abstract driver to use an alternate implementation(s) of SQL QP method(s) that treat
  boolean literals as comparison expressions in filter clauses and logical operators."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.store :as qp.store]))

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

(defn- some-isa? [child parents]
  (some #(isa? child %) parents))

(defn- boolean-typed?
  ([m]
   (boolean-typed? m [:type/Boolean]))
  ([m boolean-types]
   (and (map? m)
        (some-isa? ((some-fn :base-type :effective-type)
                    ;; :value clauses have snake keys like :base_type, but field metadata is a snake-hating-map and
                    ;; will throw if you try to access snake keys, so normalize them first.
                    (update-keys m mbql.u/normalize-token))
                   boolean-types))))

(defn- boolean-typed-clause? [[_tag _x options]]
  (boolean-typed? options))

(defn- boolean-field-clause? [clause]
  (and (mbql.u/is-clause? :field clause)
       (let [[_ id-or-name options] clause
             has-types? (some-fn :base-type :base_type :effective-type :effective_type)
             boolean-types [:type/Boolean :type/Decimal]]
         (or (boolean-typed? options boolean-types)
             ;; If :base-type is not present in the options, try looking it up in the metadata provider.
             (and (integer? id-or-name)
                  (not (has-types? options))
                  (boolean-typed? (lib.metadata/field (qp.store/metadata-provider) id-or-name)
                                  boolean-types))))))

(defn- boolean-value-clause? [clause]
  (and (mbql.u/is-clause? :value clause)
       (or (boolean? (second clause))
           (boolean-typed-clause? clause))))

(defn- boolean-expression-clause? [clause]
  (and (mbql.u/is-clause? :expression clause)
       (or (boolean-typed-clause? clause)
           (boolean-value-clause? (mbql.u/expression-with-name sql.qp/*inner-query* (second clause))))))

(defn- boolean->comparison
  "Convert boolean field refs or expression literals to equivalent boolean comparison expressions.

  The input `clause` is MBQL. The output is a compiled honeysql form."
  [clause]
  (if (or (boolean? clause)
          (boolean-value-clause? clause)
          (boolean-field-clause? clause)
          (boolean-expression-clause? clause))
    [:= clause true]
    clause))

(defmethod sql.qp/apply-top-level-clause [::boolean-is-comparison :filter]
  [driver _ honeysql-form {clause :filter}]
  (sql.helpers/where honeysql-form (->> (boolean->comparison clause)
                                        (sql.qp/->honeysql driver))))

(prefer-method sql.qp/apply-top-level-clause [::boolean-is-comparison :filter] [:sql :filter])

(defn- compile-logical-op [driver [tag & _ :as clause]]
  (let [parent-method (get-method sql.qp/->honeysql [:sql tag])]
    (->> (mapv boolean->comparison clause)
         (parent-method driver))))

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
  [driver [_ cond-cases :as clause]]
  (let [parent-method (get-method sql.qp/->honeysql [:sql :case])]
    (->> cond-cases
         (mapv (fn [[e1 e2]]
                 [(boolean->comparison e1) e2]))
         (assoc clause 1)
         (parent-method driver))))

(doseq [tag [:and :or :not :case]]
  (prefer-method sql.qp/->honeysql [::boolean-is-comparison tag] [:sql tag]))
