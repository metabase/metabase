(ns metabase.driver.druid
  "Druid driver."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
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
    (let [{:keys [auth-enabled auth-username auth-token-value]} details]
      (= 200 (:status (http/get (druid.client/details->url details-with-tunnel "/status")
                                (cond-> {}
                                  auth-enabled (assoc :basic-auth (str auth-username ":" auth-token-value)))))))))

(defmethod driver/describe-table :druid
  [_ database table]
  (druid.sync/describe-table database table))

(defmethod driver/describe-database :druid
  [_ database]
  (druid.sync/describe-database database))

(defmethod driver/mbql->native :druid
  [_ query]
  (druid.qp/mbql->native query))

(defn- add-timeout-to-query [query timeout]
  (let [parsed (if (string? query)
                 (json/parse-string query keyword)
                 query)]
    (assoc-in parsed [:context :timeout] timeout)))

(defmethod driver/execute-reducible-query :druid
  [_ query context respond]
  (druid.execute/execute-reducible-query
    (partial druid.client/do-query-with-cancellation (qp.context/canceled-chan context))
    (update-in query [:native :query] add-timeout-to-query (qp.context/timeout context))
    respond))

(doseq [[feature supported?] {:set-timezone            true
                              :expression-aggregations true}]
  (defmethod driver/supports? [:druid feature] [_ _] supported?))

(defmethod driver/db-start-of-week :druid
  [_]
  :sunday)
