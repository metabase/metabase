(ns metabase.test.data.druid
  (:require [clojure.string :as str]
            [metabase.driver.druid.client :as druid.client]
            [metabase.test.data.interface :as tx]
            [metabase.util :as u]))

(tx/add-test-extensions! :druid)

(defn- host []
  ;; disable the env var for now so the value in CircleCI (our ec2 server) doesn't stomp on the new localhost one
  "http://localhost"
  #_(tx/db-test-env-var-or-throw :druid :host "http://localhost"))

(defn- broker-port []
  8082
  #_(Integer/parseUnsignedInt (tx/db-test-env-var-or-throw :druid :port (tx/db-test-env-var-or-throw :druid :broker-port "8082"))))

(defn- broker-port-up? []
  (u/host-port-up? (str/replace (host) #"^https?://" "") (broker-port)))

(defmethod tx/dbdef->connection-details :druid [])

(defmethod tx/dbdef->connection-details :druid
  [& _]
  {:host (host)
   :port (broker-port)})

(defn- datasources-endpoint []
  (format "%s:%d/druid/v2/datasources" (host) (broker-port)))

(defn- datasources []
  {:pre [(broker-port-up?)]}
  (druid.client/GET (datasources-endpoint)))

(defn- already-loaded []
  (set (datasources)))

(defmethod tx/create-db! :druid
  [_ dbdef & _]
  (let [{:keys [database-name table-definitions], :as dbdef} (tx/get-dataset-definition dbdef)]
    (assert (= database-name "checkins")
      "Druid tests currently only support the flattened test-data dataset.")
    (assert (contains? (already-loaded) "checkins")
      "Expected 'checkins' dataset to be present in Druid datasources. (This should be loaded as part of building Docker image")
    nil))
