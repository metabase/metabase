(ns metabase.db.connection-pool.noop
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.db.connection-pool.interface :as i])
  (:import java.sql.Connection))

(defmethod i/connection-pool-spec :noop
  [_ jdbc-spec & _]
  {:connection (jdbc/get-connection jdbc-spec)})

(defmethod i/destroy-connection-pool! :noop [_ {:keys [^Connection connection]}]
  (.close connection))
