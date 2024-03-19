(ns metabase.test.data.druid-jdbc
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.interface :as tx]))

(tx/add-test-extensions! :druid-jdbc)

(defmethod tx/dbdef->connection-details :druid-jdbc
  [& _]
  {:host "localhost"
   :port "8888"})

;; TODO: Use tx/dbdef->connection-details.
(defn- already-loaded []
  (set (json/parse-string (:body (http/get "http://localhost:8888/druid/v2/datasources")))))

(defmethod tx/create-db! :druid-jdbc
  [_ dbdef & _]
  (let [{:keys [database-name], :as _dbdef} (tx/get-dataset-definition dbdef)]
    (assert (= database-name "checkins")
            "Druid tests currently only support the flattened test-data dataset.")
    (assert (contains? (already-loaded) "checkins")
            "Expected 'checkins' dataset to be present in Druid datasources. (This should be loaded as part of building Docker image)")
    nil))

(defmethod tx/destroy-db! :druid-jdbc
  [& _]
  nil)

(defmethod tx/default-dataset :druid-jdbc
  [_]
  (tx/flattened-dataset-definition defs/test-data "checkins"))
