(ns metabase.driver.postgres.pivot
  "PostgreSQL-specific SQL generation for native pivot tables.

  Fulfills the contract required by [[metabase.query-processor.pivot/run-native-pivot-query]]: when the
  `:native-pivot-tables` feature is declared, the driver must produce a result set containing all breakout columns,
  a `\"pivot-grouping\"` integer bitmask column, and the aggregation columns. This namespace achieves that by
  rewriting the `GROUP BY` clause to use `GROUPING SETS` and appending a `GROUPING()` call to the `SELECT`.

  This file serves as the reference implementation for adding `:native-pivot-tables` support to other drivers.
  The `GROUPING()` function and `GROUPING SETS` clause are part of the SQL standard and are supported by
  PostgreSQL, Redshift, MySQL 8+, Snowflake, BigQuery, Oracle, and SQL Server."
  (:refer-clojure :exclude [mapv empty? not-empty select-keys])
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.pivot.common :as pivot.common]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.performance :refer [mapv empty? not-empty select-keys]]))

(set! *warn-on-reflection* true)

(def ^:private pivot-grouping-column-name
  "pivot-grouping")

(defn- format-grouping-fn
  "HoneySQL formatter for the SQL `GROUPING()` function. Each arg is a separate column expression.
  `GROUPING()` is standard SQL (not PostgreSQL-specific) and is supported by most analytical databases.
  It returns an integer bitmask indicating which of the supplied columns are aggregated (NULL) in the current row."
  [_fn args]
  (let [sqls-and-params (map #(sql/format-expr % {:nested true}) args)
        sqls            (map first sqls-and-params)
        params          (mapcat rest sqls-and-params)]
    (into [(str "GROUPING(" (str/join ", " sqls) ")")]
          params)))

(sql/register-fn! ::grouping-fn format-grouping-fn)

(defn- grouping-fn-expr
  "HoneySQL form for GROUPING(breakoutN, ..., breakout0).
   Uses varargs so each column is passed as a separate arg to the formatter.
   Includes every breakout expression so remapped columns are accounted for."
  [breakout-exprs]
  (into [::grouping-fn] (reverse breakout-exprs)))

(defn- format-grouping-sets
  "Format GROUP BY GROUPING SETS (...) clause. Each arg is a vector of expressions for one set."
  [_fn args]
  (let [format-set (fn [set-exprs]
                     (if (empty? set-exprs)
                       ["()"]
                       (let [sqls-and-params (map #(sql/format-expr % {:nested true}) set-exprs)
                             sqls            (map first sqls-and-params)
                             params          (mapcat rest sqls-and-params)]
                         (into [(str "(" (str/join ", " sqls) ")")]
                               params))))
        set-results (map format-set args)
        sets-sqls   (map first set-results)
        all-params  (mapcat rest set-results)]
    (into [(str "GROUPING SETS (" (str/join ", " sets-sqls) ")")]
          all-params)))

(sql/register-fn! ::grouping-sets format-grouping-sets)

(defn- grouping-set-combinations->honeysql
  "Convert unremapped breakout combinations to HoneySQL GROUPING SET expressions."
  [driver breakout-fields {:keys [qp.pivot/breakout-combinations
                                  qp.pivot/remapped-indexes]}]
  (let [breakout-exprs (mapv (partial sql.qp/->honeysql driver) breakout-fields)]
    (mapv (fn [combination]
            (let [full-combination (pivot.common/full-breakout-combination
                                    {:qp.pivot/remapped-breakout-combination combination
                                     :qp.pivot/remapped-indexes              remapped-indexes})]
              (mapv #(nth breakout-exprs %) full-combination)))
          breakout-combinations)))

(defn- native-pivot-order-by-clauses
  "Order-by clauses for native pivot queries: use any remaining MBQL `:order-by` on the inner query, else ASC on
  each breakout (matches [[metabase.driver.sql.query-processor/apply-top-level-clause]] `[:sql :order-by]`)."
  [{:keys [order-by breakout]}]
  (or (not-empty order-by)
      (mapv (fn [breakout-field] [:asc breakout-field]) breakout)))

(defn- native-pivot-order-by->honeysql
  "Compile a native-pivot order-by clause, using `NULLS LAST` for ASC (so subtotal/grand-total rows sort last)."
  [driver order-by-clause]
  (let [[expr direction :as compiled] (sql.qp/->honeysql driver order-by-clause)]
    (if (= direction :asc)
      [expr :asc-nulls-last]
      compiled)))

(defn- flatten-over-order-by-entry
  "Normalize a single OVER `order-by` entry to `[expr direction]` (HoneySQL 2 shape)."
  [entry]
  (loop [e entry]
    (if (and (vector? e) (= 2 (count e)) (keyword? (second e)))
      (let [expr (first e)]
        (if (and (vector? expr) (= 2 (count expr)) (keyword? (second expr)))
          (recur expr)
          [(if (vector? expr) (vec expr) expr) (second e)]))
      e)))

(defn- normalize-over-order-by-in-form
  "Fix doubly-nested `:order-by` vectors inside `:over` expressions after the parent breakout pass."
  [form]
  (cond
    (and (vector? form)
         (= :over (first form))
         (<= 2 (count form)))
    (let [[tag inner & rest] form
          inner' (if (map? inner)
                   (update inner :order-by
                           (fn [order-bys]
                             (mapv flatten-over-order-by-entry order-bys)))
                   inner)]
      (into [tag inner'] rest))

    (vector? form)
    (mapv normalize-over-order-by-in-form form)

    (map? form)
    (into {} (map (fn [[k v]] [k (normalize-over-order-by-in-form v)]) form))

    :else
    form))

(defn apply-native-pivot-breakout
  "Apply breakout clause for native pivot queries using `GROUP BY GROUPING SETS`.

  This function fulfills the native-pivot driver contract: the resulting SQL must produce a result set with:
    1. All breakout columns (with NULLs for aggregated dimensions in subtotal rows).
    2. A `\"pivot-grouping\"` column containing an integer bitmask from `GROUPING()`.
    3. All aggregation columns.

  It delegates to the parent `:sql` breakout method for proper `SELECT`/`GROUP BY` aliasing, then appends the
  `GROUPING()` expression to `SELECT` and replaces the `GROUP BY` with `GROUPING SETS` derived from the breakout
  combinations computed by [[metabase.query-processor.pivot/breakout-combinations]]."
  [driver honeysql-form {breakout-fields :breakout, :as inner-query}]
  (let [parent-method   (get-method sql.qp/apply-top-level-clause [:sql :breakout])
        base-hsql       (parent-method driver :breakout honeysql-form inner-query)
        select-fn       (if (:select-top base-hsql)
                          sql.helpers/select-top
                          sql.helpers/select)
        breakout-exprs  (mapv (partial sql.qp/->honeysql driver) breakout-fields)
        grouping-expr   (grouping-fn-expr breakout-exprs)
        grouping-alias  (sql.qp/->honeysql driver
                                           (h2x/identifier :field-alias
                                                           (driver/escape-alias driver pivot-grouping-column-name)))
        grouping-sets     (grouping-set-combinations->honeysql driver breakout-fields inner-query)
        gs-expr           (into [::grouping-sets] grouping-sets)
        order-by-clauses   (native-pivot-order-by-clauses inner-query)
        honeysql-order-bys (into [[(sql.qp/compiled grouping-expr) :asc]]
                                 (map (partial native-pivot-order-by->honeysql driver))
                                 order-by-clauses)]
    (let [hsql (-> base-hsql
                   normalize-over-order-by-in-form
                   ;; `grouping-expr` is itself a HoneySQL vector; wrap with `compiled` so `select` treats it as one
                   ;; expression (same pattern as [[metabase.driver.sql.query-processor/apply-top-level-clause]] `[:sql :aggregation]`).
                   (select-fn [(sql.qp/compiled grouping-expr) [grouping-alias]])
                   (assoc :group-by [gs-expr]))]
      (if (seq honeysql-order-bys)
        (reduce sql.helpers/order-by hsql honeysql-order-bys)
        hsql))))

(def ^:private native-pivot-query-keys
  #{:qp.pivot/native-pivot?
    :qp.pivot/breakout-combinations
    :qp.pivot/num-unremapped-breakouts
    :qp.pivot/num-remapped-breakouts
    :qp.pivot/num-remapped-cols
    :qp.pivot/remapped-indexes})

(defn merge-native-pivot-keys
  "Copy native pivot keys from the outer MBQL 5 query onto `target` (MBQL 4 inner query or MBQL 5 stage)."
  [mbql5-query target]
  (merge target (select-keys mbql5-query native-pivot-query-keys)))

(defn merge-native-pivot-keys-into-stages
  "Copy native pivot keys onto the last MBQL 5 stage, if any pivot keys are present on the outer query."
  [mbql5-query stages]
  (if (and (seq stages)
           (seq (select-keys mbql5-query native-pivot-query-keys)))
    (update stages (dec (count stages)) #(merge-native-pivot-keys mbql5-query %))
    stages))
