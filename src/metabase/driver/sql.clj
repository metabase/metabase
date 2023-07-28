(ns metabase.driver.sql
  "Shared code for all drivers that use SQL under the hood."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.driver.common.parameters.values :as params.values]
   [metabase.driver.sql.parameters.substitute :as sql.params.substitute]
   [metabase.driver.sql.parameters.substitution
    :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util.unprepare :as unprepare]
   [metabase.util.schema :as su]
   [potemkin :as p]
   [schema.core :as s]))

(comment sql.params.substitution/keep-me) ; this is so `cljr-clean-ns` and the linter don't remove the `:require`

(driver/register! :sql, :abstract? true)

(doseq [feature [:standard-deviation-aggregations
                 :foreign-keys
                 :expressions
                 :expression-aggregations
                 :native-parameters
                 :nested-queries
                 :binning
                 :advanced-math-expressions
                 :percentile-aggregations
                 :regex]]
  (defmethod driver/database-supports? [:sql feature] [_driver _feature _db] true))

(doseq [join-feature [:left-join
                      :right-join
                      :inner-join
                      :full-join]]
  (defmethod driver/database-supports? [:sql join-feature]
    [driver _feature db]
    (driver/database-supports? driver :foreign-keys db)))

(defmethod driver/mbql->native :sql
  [driver query]
  (sql.qp/mbql->native driver query))

(s/defmethod driver/substitute-native-parameters :sql
  [_ {:keys [query] :as inner-query} :- {:query su/NonBlankString, s/Keyword s/Any}]
  (let [[query params] (-> query
                           params.parse/parse
                           (sql.params.substitute/substitute (params.values/query->params-map inner-query)))]
    (assoc inner-query
           :query query
           :params params)))

;; `:sql` drivers almost certainly don't need to override this method, and instead can implement
;; `unprepare/unprepare-value` for specific classes, or, in extereme cases, `unprepare/unprepare` itself.
(defmethod driver/splice-parameters-into-native-query :sql
  [driver {:keys [params], sql :query, :as query}]
  (cond-> query
    (seq params)
    (merge {:params nil
            :query  (unprepare/unprepare driver (cons sql params))})))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Connection Impersonation                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti set-role-statement
  "SQL for setting the active role for a connection, such as USE ROLE or equivalent, for the given driver."
  {:arglists '([driver role])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod set-role-statement :default
  [_ _ _]
  nil)

(defmulti default-database-role
  "The name of the default role for a given database, used for queries that do not have custom user
  impersonation rules configured for them. This must be implemented for each driver that supports user impersonation."
  {:arglists '(^String [driver database])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod default-database-role :default
  [_ _database]
  nil)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Convenience Imports                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(p/import-vars [sql.params.substitution ->prepared-substitution PreparedStatementSubstitution])

;; TODO - we should add imports for `sql.qp` and other namespaces to make driver implementation more straightforward
