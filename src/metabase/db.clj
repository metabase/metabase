(ns metabase.db
  "High-level functions for setting up the Metabase application database. Additional functions can be found in
  sub-namespaces:

  * [[metabase.db.connection]] - functions for getting the application database type (e.g. `:h2`) and a
    [[clojure.java.jdbc]] spec for it; dynamic variable for rebinding it

  * [[metabase.db.connection-pool-setup]] - functions for creating a connection pool for the application database

  * [[metabase.db.data-migrations]] - Clojure-land data migration definitions and functions for running them

  * [[metabase.db.data-source]] - Implementations of [[javax.sql.DataSource]] for raw connection strings and
    broken-out db details. See [[metabase.db.env/broken-out-details]] for more details about what 'broken-out details'
    means.

  * [[metabase.db.env]] - functions for getting application database connection information from environment variables

  * [[metabase.db.jdbc-protocols]] - implementations of [[clojure.java.jdbc]] protocols for the Metabase application
    database

  * [[metabase.db.liquibase]] - high-level Clojure wrapper around relevant parts of the Liquibase API

  * [[metabase.db.setup]] - code related to setting up the application DB -- verifying the connection and running
    migrations -- and for setting it up as the default Toucan connection

  * [[metabase.db.spec]] - util functions for creating JDBC specs for supported application DB types from connection
    details maps

  * [[metabase.db.util]] - general util functions for Toucan/HoneySQL queries against the application DB"
  (:require [metabase.config :as config]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.setup :as mdb.setup]
            [potemkin :as p]))

;; TODO - determine if we *actually* need to import any of these
;;
;; These are mostly here as a convenience to avoid having to rework a bunch of existing code. It's better to use these
;; functions directly where applicable.
(p/import-vars
 [mdb.connection
  db-type
  quoting-style])

;; TODO -- consider whether we can just do this automatically when `getConnection` is called on
;; [[mdb.connection/*application-db*]] (or its data source)
(defn db-is-set-up?
  "True if the Metabase DB is setup and ready."
  []
  (= @(:status mdb.connection/*application-db*) ::setup-finished))

(defn setup-db!
  "Do general preparation of database by validating that we can connect. Caller can specify if we should run any pending
  database migrations. If DB is already set up, this function will no-op. Thread-safe."
  []
  (when-not (db-is-set-up?)
    ;; It doesn't really matter too much what we lock on, as long as the lock is per-application-DB e.g. so we can run
    ;; setup for DIFFERENT application DBs at the same time, but CAN NOT run it for the SAME application DB. We can just
    ;; use the application DB object itself to lock on since that will be a different object for different application
    ;; DBs.
    (locking mdb.connection/*application-db*
      (when-not (db-is-set-up?)
        (let [db-type       (mdb.connection/db-type)
              data-source   (mdb.connection/data-source)
              auto-migrate? (config/config-bool :mb-db-automigrate)]
          (mdb.setup/setup-db! db-type data-source auto-migrate?))
        (reset! (:status mdb.connection/*application-db*) ::setup-finished))))
  :done)
