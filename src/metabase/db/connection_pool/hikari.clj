(ns metabase.db.connection-pool.hikari
  "HikariCP implementation of Metabase connection pools for application DB and JDBC-based drivers."
  (:require [metabase.db.connection-pool.interface :as i])
  (:import [com.zaxxer.hikari HikariConfig HikariDataSource]))

(defn- hikari-ds [{:keys [subname subprotocol], :as spec} & [pool-options]]
  (let [config (doto (HikariConfig.)
                 (.setJdbcUrl (format "jdbc:%s:%s" subprotocol subname)))]
    (doseq [[k v] (dissoc spec :classname :subprotocol :subname :type)
            :when v]
      (.addDataSourceProperty config (name k) v))
    (HikariDataSource. config)))

(defmethod i/connection-pool-spec :hikari
  [_ jdbc-spec & [pool-options]]
  {:datasource (hikari-ds jdbc-spec pool-options)})


(defmethod i/destroy-connection-pool! :hikari
  [_, {:keys [^HikariDataSource datasource]}]
  (.close datasource))
