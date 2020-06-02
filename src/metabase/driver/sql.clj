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
            [metabase.driver.sql.util.unprepare :as unprepare]
            [potemkin :as p]))

(comment param-substitution/keep-me) ; this is so `cljr-clean-ns` and the liner don't remove the `:require`

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
;;; |                                              Convenience Imports                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(p/import-vars [param-substitution ->prepared-substitution PreparedStatementSubstitution])

;; TODO - we should add imports for `sql.qp` and other namespaces to make driver implementation more straightforward
