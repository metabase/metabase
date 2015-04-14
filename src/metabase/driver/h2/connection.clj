(ns metabase.driver.h2.connection
  (:require [clojure.set :as set]
            korma.db
            [metabase.driver :refer [can-connect? can-connect-with-details? connection connection-details]]
            [metabase.driver.generic-sql.connection :as generic]))

(defmethod connection-details :h2 [{:keys [details]}]
  (set/rename-keys details {:conn_str :db}))

(defmethod connection :h2 [database]
  (korma.db/h2 (connection-details database)))

(defmethod can-connect? :h2 [database]
  (generic/can-connect? database))

(defmethod can-connect-with-details? :h2 [details-map]
  (let [connection (korma.db/h2 (set/rename-keys details-map {:conn_str :db}))]
    (generic/test-connection connection)))
