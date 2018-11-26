(ns metabase.driver.sql-jdbc.connection
  "Logic for creating and managing connection pools for SQL JDBC drivers. Implementations for connection-related driver
  multimethods for SQL JDBC drivers."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [metabase
             [db :as mdb]
             [driver :as driver]
             [util :as u]]
            [metabase.models.database :refer [Database]]
            [metabase.util
             [i18n :refer [tru]]
             [ssh :as ssh]]
            [toucan.db :as db])
  (:import com.mchange.v2.c3p0.ComboPooledDataSource))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Interface                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti connection-details->spec
  "Given a Database `details-map`, return a JDBC connection spec."
  {:arglists '([driver details-map]), :style/indent 1}
  driver/dispatch-on-driver
  :hierarchy #'driver/hierarchy)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Creating Connection Pools                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private database-id->connection-pool
  "A map of our currently open connection pools, keyed by Database `:id`."
  (atom {}))

(defn- create-connection-pool
  "Create a new C3P0 `ComboPooledDataSource` for connecting to the given DATABASE."
  [{:keys [id engine details], :as database}]
  {:pre [(map? database)]}
  (log/debug (u/format-color 'cyan "Creating new connection pool for database %d ..." id))
  (let [details-with-tunnel (ssh/include-ssh-tunnel details) ;; If the tunnel is disabled this returned unchanged
        spec                (connection-details->spec engine details-with-tunnel)]
    (assoc (mdb/connection-pool (assoc spec
                                  :minimum-pool-size           1
                                  ;; prevent broken connections closed by dbs by testing them every 3 mins
                                  :idle-connection-test-period (* 3 60)
                                  ;; prevent overly large pools by condensing them when connections are idle for 15m+
                                  :excess-timeout              (* 15 60)))
      :ssh-tunnel (:tunnel-connection details-with-tunnel))))

(defn notify-database-updated
  "Default implementation of `driver/notify-database-updated` for JDBC SQL drivers. We are being informed that a
  DATABASE has been updated, so lets shut down the connection pool (if it exists) under the assumption that the
  connection details have changed."
  [_ database]
  (when-let [pool (get @database-id->connection-pool (u/get-id database))]
    (log/debug (u/format-color 'red (tru "Closing connection pool for database {0} ..." (u/get-id database))))
    ;; remove the cached reference to the pool so we don't try to use it anymore
    (swap! database-id->connection-pool dissoc (u/get-id database))
    ;; now actively shut down the pool so that any open connections are closed
    (.close ^ComboPooledDataSource (:datasource pool))
    (when-let [ssh-tunnel (:ssh-tunnel pool)]
      (.disconnect ^com.jcraft.jsch.Session ssh-tunnel))))

(defn db->pooled-connection-spec
  "Return a JDBC connection spec that includes a cp30 `ComboPooledDataSource`.
   Theses connection pools are cached so we don't create multiple ones to the same DB."
  [database-or-id]
  (if (contains? @database-id->connection-pool (u/get-id database-or-id))
    ;; we have an existing pool for this database, so use it
    (get @database-id->connection-pool (u/get-id database-or-id))
    ;; create a new pool and add it to our cache, then return it
    (let [db (if (map? database-or-id) database-or-id (db/select-one [Database :id :engine :details]
                                                        :id database-or-id))]
      (u/prog1 (create-connection-pool db)
        (swap! database-id->connection-pool assoc (u/get-id database-or-id) <>)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn can-connect?
  "Default implementation of `driver/can-connect?` for SQL JDBC drivers. Checks whether we can perform a simple `SELECT
  1` query."
  [driver details]
  (let [details-with-tunnel (ssh/include-ssh-tunnel details)
        connection          (connection-details->spec driver details-with-tunnel)]
    (= 1 (first (vals (first (jdbc/query connection ["SELECT 1"])))))))
