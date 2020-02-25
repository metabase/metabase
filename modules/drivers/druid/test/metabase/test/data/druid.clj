(ns metabase.test.data.druid
  (:require [clojure.string :as str]
            [metabase.driver.druid.client :as druid.client]
            [metabase.middleware.json :as middleware.json]
            [metabase.test.data.interface :as tx]
            [metabase.util :as u]))

;; this is needed so the Cheshire protocols to convert Temporal values to JSON are loaded
(comment middleware.json/keep-me)

(tx/add-test-extensions! :druid)

(defn- host []
  ;; disable the env var for now so the value in CircleCI (our ec2 server) doesn't stomp on the new localhost one
  "http://localhost"
  #_(tx/db-test-env-var-or-throw :druid :host "http://localhost"))

(defn- test-env-var-port [k not-found]
  (let [port (tx/db-test-env-var-or-throw :druid k not-found)]
    (cond-> port
      (string? port) Integer/parseUnsignedInt)))

(defn- ports [port-name]
  (case port-name
    :coordinator (test-env-var-port :coordinator-port 8081)
    :broker      (test-env-var-port :broker-port 8082)
    ;; with the normal nano config we use in CI the overlord runs as part of the same process as the coordinator, so
    ;; it will be 8081 insteal of 8090.
    :overlord    (test-env-var-port :overlord-port (ports :coordinator))
    :router      (test-env-var-port :router-port 8888)))

(defn- port-up? [port-name]
  (u/host-port-up? (str/replace (host) #"^https?://" "") (ports port-name)))

(defmethod tx/dbdef->connection-details :druid [])

(defmethod tx/dbdef->connection-details :druid
  [& _]
  {:host (host)
   :port (test-env-var-port :port (ports :broker))})

(defn- datasources-endpoint []
  (format "%s:%d/druid/v2/datasources" (host) (ports :broker)))

(defn- datasources []
  {:pre [(port-up? :broker)]}
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
