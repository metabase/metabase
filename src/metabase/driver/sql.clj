(ns metabase.driver.sql
  "Shared code for all drivers that use SQL under the hood."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.driver.common.parameters.values :as params.values]
   [metabase.driver.sql.parameters.substitute :as sql.params.substitute]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli :as mu]
   [potemkin :as p]))

(comment sql.params.substitution/keep-me) ; this is so `cljr-clean-ns` and the linter don't remove the `:require`

(driver/register! :sql, :abstract? true)

(doseq [feature [:advanced-math-expressions
                 :binning
                 :expression-aggregations
                 :expressions
                 :full-join
                 :inner-join
                 :left-join
                 :native-parameters
                 :nested-queries
                 :parameterized-sql
                 :percentile-aggregations
                 :regex
                 :right-join
                 :standard-deviation-aggregations
                 :metadata/key-constraints
                 :window-functions/cumulative
                 :window-functions/offset]]
  (defmethod driver/database-supports? [:sql feature] [_driver _feature _db] true))

(defmethod driver/database-supports? [:sql :persist-models-enabled]
  [driver _feat db]
  (and
    (driver/database-supports? driver :persist-models db)
    (-> db :settings :persist-models-enabled)))

(defmethod driver/mbql->native :sql
  [driver query]
  (sql.qp/mbql->native driver query))

(defmethod driver/prettify-native-form :sql
  [driver native-form]
  (sql.u/format-sql-and-fix-params driver native-form))

(mu/defmethod driver/substitute-native-parameters :sql
  [_driver {:keys [query] :as inner-query} :- [:and [:map-of :keyword :any] [:map {:query ::lib.schema.common/non-blank-string}]]]
  (let [[query params] (-> query
                           params.parse/parse
                           (sql.params.substitute/substitute (params.values/query->params-map inner-query)))]
    (assoc inner-query
           :query query
           :params params)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Connection Impersonation                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti set-role-statement
  "SQL for setting the active role for a connection, such as USE ROLE or equivalent, for the given driver."
  {:added "0.47.0" :arglists '([driver role])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod set-role-statement :default
  [_ _ _]
  nil)

(defmulti default-database-role
  "The name of the default role for a given database, used for queries that do not have custom user
  impersonation rules configured for them. This must be implemented for each driver that supports user impersonation."
  {:added "0.47.0" :arglists '(^String [driver database])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod default-database-role :default
  [_ _database]
  nil)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Convenience Imports                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(p/import-vars [sql.params.substitution ->prepared-substitution PreparedStatementSubstitution])
