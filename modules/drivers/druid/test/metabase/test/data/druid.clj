(ns metabase.test.data.druid
  (:require [clojure.string :as str]
            [metabase.driver.druid.client :as druid.client]
            [metabase.test.data.impl :as data.impl]
            [metabase.test.data.interface :as tx]
            [metabase.util :as u]))

(set! *warn-on-reflection* true)

(tx/add-test-extensions! :druid)

(defn- host []
  ;; force Druid to use localhost for now -- this is until we remove the env var in CircleCI so it doesn't override
  ;; this value.
  "http://localhost"
  #_(let [host (tx/db-test-env-var-or-throw :druid :host "localhost")]
    (cond->> host
      (not (str/starts-with? host "http")) (str "http://"))))

(defn- broker-port []
  (Integer/parseUnsignedInt (tx/db-test-env-var-or-throw :druid :port "8082")))

(defn- broker-port-up? []
  (u/host-port-up? (str/replace (host) #"^https?://" "") (broker-port)))

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
  (let [{:keys [database-name], :as _dbdef} (tx/get-dataset-definition dbdef)]
    (assert (= database-name "checkins")
      "Druid tests currently only support the flattened test-data dataset.")
    (assert (contains? (already-loaded) "checkins")
      "Expected 'checkins' dataset to be present in Druid datasources. (This should be loaded as part of building Docker image)")
    nil))

;; NO-OP
(defmethod tx/destroy-db! :druid
  [& _]
  nil)

;; no-op -- because the names of the columns actually loaded by Druid differ from ones in the database definition, the
;; default impl will fail. TODO -- we should write an implementation that works for Druid
(defmethod data.impl/verify-data-loaded-correctly :druid
  [_ _ _]
  nil)
