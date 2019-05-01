(ns metabase.driver.orientdb
  (:require [clojure.tools.logging :as log]
            [metabase.driver :as driver]
            [metabase.query-processor.store :as store]
            [metabase.driver.sql-jdbc.connection :as jdbc-conn]
            [clojure.java.jdbc :as jdbc]))

(defmethod jdbc-conn/connection-details->spec :orientdb [_ {:keys [host dbname user password]}]
  {:classname "com.orientechnologies.orient.jdbc.OrientJdbcDriver"
   :subprotocol "orient"
   :subname (str "remote:" host "/" dbname)
   :user user
   :password password})

(defmethod driver/execute-query :orientdb [_ query]
  (let [db-connection (jdbc-conn/db->pooled-connection-spec (store/database))
        query-str (get-in query [:native :query])
        results (jdbc/query db-connection [query-str])
        columns (map name (keys (first results)))
        rows (map vals results)]
    {:columns columns
     :rows    rows}))
