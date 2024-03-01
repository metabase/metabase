(ns metabase.db
  "High-level functions for setting up the Metabase application database. Additional functions can be found in
  sub-namespaces:

  * [[metabase.db.connection]] - functions for getting the application database type (e.g. `:h2`) and a
    [[clojure.java.jdbc]] spec for it; dynamic variable for rebinding it

  * [[metabase.db.connection-pool-setup]] - functions for creating a connection pool for the application database

  * [[metabase.db.custom-migrations]] - Clojure-land data migration definitions and functions for running them

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
  (:require
   [metabase.config :as config]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.setup :as mdb.setup]
   [metabase.db.spec :as mdb.spec]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

;; TODO - determine if we *actually* need to import any of these
;;
;; These are mostly here as a convenience to avoid having to rework a bunch of existing code. It's better to use these
;; functions directly where applicable.
(p/import-vars
 [mdb.connection
  quoting-style

  db-type
  unique-identifier
  data-source
  get-connection]

 [mdb.spec
  make-subname
  spec])

;; TODO -- consider whether we can just do this automatically when `getConnection` is called on
;; [[mdb.connection/*application-db*]] (or its data source)
(defn db-is-set-up?
  "True if the Metabase DB is setup and ready."
  []
  (= @(:status mdb.connection/*application-db*) ::setup-finished))

(defn app-db
  "The Application database. A record, but use accessors [[db-type]], [[data-source]], etc to acess. Also
  implements [[javax.sql.DataSource]] directly, so you can call [[.getConnection]] on it directly."
  ^metabase.db.connection.ApplicationDB []
  mdb.connection/*application-db*)

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
        (let [db-type       (db-type)
              data-source   (data-source)
              auto-migrate? (config/config-bool :mb-db-automigrate)]
          (mdb.setup/setup-db! db-type data-source auto-migrate?))
        (reset! (:status mdb.connection/*application-db*) ::setup-finished))))
  :done)

(defn memoize-for-application-db
  "Like [[clojure.core/memoize]], but only memoizes for the current application database; memoized values will be
  ignored if the app DB is dynamically rebound. For TTL memoization with [[clojure.core.memoize]], set
  `:clojure.core.memoize/args-fn` instead; see [[metabase.driver.util/database->driver*]] for an example of how to do
  this."
  [f]
  (let [f* (memoize (fn [_application-db-id & args]
                      (apply f args)))]
    (fn [& args]
      (apply f* (unique-identifier) args))))


(defn increment-app-db-unique-indentifier!
  "Increment the [[unique-identifier]] for the Metabase application DB. This effectively flushes all caches using it as
  a key (including things using [[mdb/memoize-for-application-db]]) such as the Settings cache. Should only be used
  for testing. Not general purpose."
  []
  (assert (or (not config/is-prod?)
              (config/config-bool :mb-enable-test-endpoints)))
  (alter-var-root #'mdb.connection/*application-db* assoc :id (swap! mdb.connection/application-db-counter inc)))
