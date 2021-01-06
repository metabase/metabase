(ns metabase.db.connection-pool-setup
  "Code for creating the connection pool for the application DB and setting it as the default Toucan connection."
  (:require [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [connection-pool :as connection-pool]
             [util :as u]]
            [metabase.db
             [connection :as mdb.connection]
             [jdbc-protocols :as mdb.jdbc-protocols]]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db])
  (:import com.mchange.v2.c3p0.PoolBackedDataSource))

(def ^:private application-db-connection-pool-props
  "Options for c3p0 connection pool for the application DB. These are set in code instead of a properties file because
  we use separate options for data warehouse DBs. See
  https://www.mchange.com/projects/c3p0/#configuring_connection_testing for an overview of the options used
  below (jump to the 'Simple advice on Connection testing' section.)"
  (merge
   {"idleConnectionTestPeriod" 60}
   ;; only merge in `max-pool-size` if it's actually set, this way it doesn't override any things that may have been
   ;; set in `c3p0.properties`
   (when-let [max-pool-size (config/config-int :mb-application-db-max-connection-pool-size)]
     {"maxPoolSize" max-pool-size})))

(defn create-connection-pool!
  "Create a connection pool for the application DB and set it as the default Toucan connection. This is normally called
  once during start up; calling it a second time (e.g. from the REPL) will "
  [db-type jdbc-spec]
  (db/set-default-quoting-style! (mdb.connection/quoting-style db-type))
  ;; REPL usage only: kill the old pool if one exists
  (u/ignore-exceptions
    (when-let [^PoolBackedDataSource pool (:datasource (db/connection))]
      (log/trace "Closing old application DB connection pool")
      (.close pool)))
  (log/debug (trs "Set default db connection with connection pool..."))
  (let [pool-spec (connection-pool/connection-pool-spec jdbc-spec application-db-connection-pool-props)]
    (db/set-default-db-connection! pool-spec)
    (db/set-default-jdbc-options! {:read-columns mdb.jdbc-protocols/read-columns})
    pool-spec))
