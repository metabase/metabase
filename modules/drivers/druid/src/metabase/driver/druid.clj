(ns metabase.driver.druid
  "Druid driver."
  (:require [clj-http.client :as http]
            [metabase.driver :as driver]
            [metabase.driver.druid
             [client :as client]
             [execute :as execute]
             [query-processor :as qp]
             [sync :as sync]]
            [metabase.query-processor.context :as context]
            [metabase.util.ssh :as ssh]))

(driver/register! :druid)

(defmethod driver/can-connect? :druid
  [_ details]
  {:pre [(map? details)]}
  (ssh/with-ssh-tunnel [details-with-tunnel details]
    (= 200 (:status (http/get (client/details->url details-with-tunnel "/status"))))))

(defmethod driver/describe-table :druid
  [_ database table]
  (sync/describe-table database table))

(defmethod driver/describe-database :druid
  [_ database]
  (sync/describe-database database))

(defmethod driver/mbql->native :druid
  [_ query]
  (qp/mbql->native query))

(defmethod driver/execute-reducible-query :druid
  [_ query context respond]
  (execute/execute-reducible-query (partial client/do-query-with-cancellation (context/canceled-chan context))
                                   query respond))

(doseq [[feature supported?] {:set-timezone            true
                              :expression-aggregations true}]
  (defmethod driver/supports? [:druid feature] [_ _] supported?))
