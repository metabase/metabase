(ns metabase.db
  "High-level functions for setting up the Metabase application database. Additional functions can be found in
  sub-namespaces:

  * [[metabase.db.connection]] - functions for getting the application database type (e.g. `:h2`) and a
    [[clojure.java.jdbc]] spec for it

  * [[metabase.db.connection-pool-setup]] - functions for creating a connection pool for the application database and
    setting it as the default Toucan connection

  * [[metabase.db.data-migrations]] - Clojure-land data migration definitions and functions for running them

  * [[metabase.db.data-source]] - Implementations of [[javax.sql.DataSource]] for raw connection strings and
    broken-out db details. See [[metabase.db.env/broken-out-details]] for more details about what 'broken-out details'
    means.

  * [[metabase.db.env]] - functions for getting application database connection information from environment variables

  * [[metabase.db.jdbc-protocols]] - implementations of [[clojure.java.jdbc]] protocols for the Metabase application
    database

  * [[metabase.db.liquibase]] - high-level Clojure wrapper around relevant parts of the Liquibase API

  * [[metabase.db.setup]] - code related to setting up the application DB -- verifying the connection and running
    migrations

  * [[metabase.db.spec]] - util functions for creating JDBC specs for supported application DB types from connection
    details maps

  * [[metabase.db.util]] - general util functions for Toucan/HoneySQL queries against the application DB"
  (:require [clojure.tools.logging :as log]
            [metabase.config :as config]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.connection-pool-setup :as mdb.connection-pool-setup]
            [metabase.db.jdbc-protocols :as mdb.jdbc-protocols]
            [metabase.db.setup :as mdb.setup]
            [metabase.util :as u]
            [potemkin :as p]
            [toucan.db :as db])
  (:import javax.sql.DataSource))

;; TODO - determine if we *actually* need to import any of these
;;
;; These are mostly here as a convenience to avoid having to rework a bunch of existing code. It's better to use these
;; functions directly where applicable.
(p/import-vars
 [mdb.connection
  db-type
  quoting-style])

(defonce ^:private connection-pool-data-source*
  (atom nil))

;; I don't think we really need this anymore now that the DB sets itself up when needed.
(defn db-is-set-up?
  "True if the Metabase DB is setup and ready."
  ^Boolean []
  (some? @connection-pool-data-source*))

(defn- setup-db-if-needed!
  "Do general preparation of database by validating that we can connect. Caller can specify if we should run any pending
  database migrations. If DB is already set up, this function will no-op. Thread-safe."
  []
  (when-not @connection-pool-data-source*
    (locking connection-pool-data-source*
      (when-not @connection-pool-data-source*
        (let [db-type       (mdb.connection/db-type)
              data-source   (mdb.connection/data-source)
              auto-migrate? (config/config-bool :mb-db-automigrate)]
          (mdb.setup/setup-db! db-type data-source auto-migrate?)
          (let [pool-data-source (mdb.connection-pool-setup/create-connection-pool! db-type data-source)]
            (db/set-default-jdbc-options! {:read-columns mdb.jdbc-protocols/read-columns})
            (reset! connection-pool-data-source* pool-data-source)
            (with-open [conn (.getConnection pool-data-source)]
              (let [metadata (.getMetaData conn)]
                ;; not i18n'ed because app DB is not officially set up yet so we can't read the `site-locale` Setting
                ;; yet.
                (log/info (u/format-color 'blue "Application DB is %s %s"
                                          (.getDatabaseProductName metadata)
                                          (.getDatabaseProductVersion metadata))))))))))
  :done)

(defn- connection-pool-data-source ^DataSource []
  {:post [(instance? DataSource %)]}
  (setup-db-if-needed!)
  @connection-pool-data-source*)

(def ^:private ^DataSource data-source
  (reify DataSource
    (getConnection [_this]
      (.getConnection (connection-pool-data-source)))
    (getConnection [_this username password]
      (.getConnection (connection-pool-data-source) username password))))

(db/set-default-db-connection! {:datasource data-source})
