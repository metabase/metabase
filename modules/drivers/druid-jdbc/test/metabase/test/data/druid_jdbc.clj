(ns metabase.test.data.druid-jdbc
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.interface :as tx]))

(tx/add-test-extensions! :druid-jdbc)

(defmethod tx/dbdef->connection-details :druid-jdbc
  [& _]
  {:host "http://localhost"
   :port 8888})

(defn- already-loaded []
  (let [{:keys [host port]} (tx/dbdef->connection-details :druid-jdbc)]
    (set (json/parse-string (:body (http/get (format "%s:%s/druid/v2/datasources" host port)))))))

(def built-in-datasets #{"checkins" "json"})

(defmethod tx/create-db! :druid-jdbc
  [_ dbdef & _]
  (let [{:keys [database-name], :as _dbdef} (tx/get-dataset-definition dbdef)]
    (assert (built-in-datasets database-name)
            (str "Druid tests currently only support " built-in-datasets))
    (assert ((already-loaded) database-name)
            (format (str "`%s` is expected to be present in loaded datasources. "
                         "(This should be loaded as part of building Docker image)")
                    database-name))
    nil))

(defmethod tx/destroy-db! :druid-jdbc
  [& _]
  nil)

(defmethod tx/default-dataset :druid-jdbc
  [_]
  (tx/flattened-dataset-definition defs/test-data "checkins"))
