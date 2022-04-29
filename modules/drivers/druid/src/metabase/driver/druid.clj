(ns metabase.driver.druid
  "Druid driver."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [metabase.driver :as driver]
            [metabase.driver.druid.client :as client]
            [metabase.driver.druid.execute :as execute]
            [metabase.driver.druid.query-processor :as qp]
            [metabase.driver.druid.sync :as sync]
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

(defn- add-timeout-to-query [query timeout]
  (let [parsed (if (string? query)
                 (json/parse-string query keyword)
                 query)]
    (assoc-in parsed [:context :timeout] timeout)))

(defmethod driver/execute-reducible-query :druid
  [_ query context respond]
  (execute/execute-reducible-query
    (partial client/do-query-with-cancellation (context/canceled-chan context))
    (update-in query [:native :query] add-timeout-to-query (context/timeout context))
    respond))

(doseq [[feature supported?] {:set-timezone            true
                              :expression-aggregations true}]
  (defmethod driver/supports? [:druid feature] [_ _] supported?))

(defmethod driver/db-start-of-week :druid
  [_]
  :sunday)
