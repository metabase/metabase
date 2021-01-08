(ns metabase.db
  "High-level functions for setting up the Metabase application database. Additional functions can be found in
  sub-namespaces:

  * `metabase.db.connection` - functions for getting the application database type (e.g. `:h2`) and a
    `clojure.java.jdbc` spec for it

  * `metabase.db.connection-pool-setup` - functions for creating a connection pool for the application database and
    setting it as the default Toucan connection

  * `metabase.db.data-migrations` - Clojure-land data migration definitions and functions for running them

  * `metabase.db.env` - functions for getting application database connection information from environment variables

  * `metabase.db.jdbc-protocols` - implementations of `clojure.java.jdbc` protocols for the Metabase application
    database

  * `metabase.db.liquibase` - high-level Clojure wrapper around relevant parts of the Liquibase API

  * `metabase.db.setup` - code related to setting up the application DB -- verifying the connection and running
    migrations

  * `metabase.db.spec` - util functions for creating JDBC specs for supported application DB types from connection
    details maps

  * `metabase.db.util` - general util functions for Toucan/HoneySQL queries against the application DB"
  (:require [metabase.config :as config]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.connection-pool-setup :as mdb.connection-pool-setup]
            [metabase.db.setup :as mdb.setup]
            [potemkin :as p]))

;; TODO - determine if we *actually* need to import any of these
;;
;; These are mostly here as a convenience to avoid having to rework a bunch of existing code. It's better to use these
;; functions directly where applicable.
(p/import-vars
 [mdb.connection
  db-type
  jdbc-spec
  quoting-style])

(defonce ^:private db-setup-finished?
  (atom false))

(defn db-is-set-up?
  "True if the Metabase DB is setup and ready."
  ^Boolean []
  @db-setup-finished?)

(defn setup-db!
  "Do general preparation of database by validating that we can connect. Caller can specify if we should run any pending
  database migrations. If DB is already set up, this function will no-op. Thread-safe."
  []
  (when-not @db-setup-finished?
    (locking db-setup-finished?
      (when-not @db-setup-finished?
        (let [db-type       (mdb.connection/db-type)
              jdbc-spec     (mdb.connection/jdbc-spec)
              auto-migrate? (config/config-bool :mb-db-automigrate)]
          (mdb.setup/setup-db! db-type jdbc-spec auto-migrate?)
          (mdb.connection-pool-setup/create-connection-pool! db-type jdbc-spec))
        (reset! db-setup-finished? true))))
  :done)
