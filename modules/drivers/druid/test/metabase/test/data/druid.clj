(ns metabase.test.data.druid
  (:require [metabase.test.data
             [impl :as tx.impl]
             [interface :as tx]]))

(tx/add-test-extensions! :druid)

(defmethod tx/dbdef->connection-details :druid
  [& _]
  {:host (tx/db-test-env-var-or-throw :druid :host)
   :port (Integer/parseInt (tx/db-test-env-var-or-throw :druid :port))})

(defmethod tx/create-db! :druid
  [& _]
  nil)

(defmethod tx/destroy-db! :druid
  [& _]
  nil)

;; no-op -- because the names of the columns actually loaded by Druid differ from ones in the database definition, the
;; default impl will fail. TODO -- we should write an implementation that works for Druid
(defmethod tx.impl/verify-data-loaded-correctly :druid
  [_ _ _]
  nil)
