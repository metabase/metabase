(ns metabase.driver.sql
  "Shared code for all drivers that use SQL under the hood."
  (:require [metabase.driver :as driver]
            [metabase.driver.common.parameters
             [parse :as params.parse]
             [values :as params.values]]
            [metabase.driver.sql.parameters
             [substitute :as params.substitute]
             [substitution :as param-substitution]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [potemkin :as p]))

(comment param-substitution/keep-me) ; this is so `cljr-clean-ns` and the liner don't remove the `:require`

(driver/register! :sql, :abstract? true)

(doseq [feature [:standard-deviation-aggregations
                 :foreign-keys
                 :expressions
                 :expression-aggregations
                 :native-parameters
                 :nested-queries
                 :binning]]
  (defmethod driver/supports? [:sql feature] [_ _] true))

(doseq [join-feature [:left-join
                      :right-join
                      :inner-join
                      :full-join]]
  (defmethod driver/supports? [:sql join-feature]
    [driver _]
    (driver/supports? driver :foreign-keys)))

(defmethod driver/mbql->native :sql
  [driver query]
  (sql.qp/mbql->native driver query))

(defmethod driver/substitute-native-parameters :sql
  [_ {:keys [query] :as inner-query}]
  (let [[query params] (-> query
                           params.parse/parse
                           (params.substitute/substitute (params.values/query->params-map inner-query)))]
    {:query  query
     :params params}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Convenience Imports                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(p/import-vars [param-substitution ->prepared-substitution PreparedStatementSubstitution])

;; TODO - we should add imports for `sql.qp` and other namespaces to make driver implementation more straightforward
