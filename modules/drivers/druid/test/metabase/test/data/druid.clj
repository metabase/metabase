(ns metabase.test.data.druid
  (:require [metabase.test.data.interface :as tx]))

(tx/add-test-extensions! :druid)

(defmethod tx/dbdef->connection-details :druid
  [& _]
  {:host (tx/db-test-env-var-or-throw :druid :host)
   :port (Integer/parseInt (tx/db-test-env-var-or-throw :druid :port))})

(defmethod tx/create-db! :druid [& _]
  nil)
