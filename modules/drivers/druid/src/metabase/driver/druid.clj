(ns metabase.driver.druid
  "Druid driver."
  (:require [clj-http.client :as http]
            [metabase.driver :as driver]
            [metabase.driver.druid.client :as druid.client]
            [metabase.driver.druid.execute :as druid.execute]
            [metabase.driver.druid.query-processor :as druid.qp]
            [metabase.driver.druid.sync :as druid.sync]
            [metabase.query-processor.context :as qp.context]
            [metabase.util.ssh :as ssh]))

(driver/register! :druid)

(defmethod driver/can-connect? :druid
  [_ details]
  {:pre [(map? details)]}
  (ssh/with-ssh-tunnel [details-with-tunnel details]
    (= 200 (:status (http/get (druid.client/details->url details-with-tunnel "/status"))))))

(defmethod driver/describe-table :druid
  [_ database table]
  (druid.sync/describe-table database table))

(defmethod driver/describe-database :druid
  [_ database]
  (druid.sync/describe-database database))

(defmethod driver/mbql->native :druid
  [_ query]
  (druid.qp/mbql->native query))

(defmethod driver/execute-reducible-query :druid
  [_ query context respond]
  (druid.execute/execute-reducible-query
    (partial druid.client/do-query-with-cancellation (qp.context/canceled-chan context))
    query respond))

(doseq [[feature supported?] {:set-timezone            true
                              :expression-aggregations true}]
  (defmethod driver/supports? [:druid feature] [_ _] supported?))

(defmethod driver/db-start-of-week :druid
  [_]
  :sunday)
