(ns metabase.app-db.core
  "API namespace for the application database (app-db).

  It has a few different functions you might need:
  - A connectible for the app-db [[app-db]] and [[data-source]]
  - Information about the app-db: [[db-is-set-up?]], [[db-type]], [[quoting-style]]
  - a few other random functions that have built up for different purposes.

  Namespaces outside of src/metabase/app_db/ should not use any metabase.app-db.* namespace but use this api namespace."
  (:refer-clojure :exclude [compile])
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.connection-pool-setup :as mdb.connection-pool-setup]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.encryption :as mdb.encryption]
   [metabase.app-db.env :as mdb.env]
   [metabase.app-db.format]
   [metabase.app-db.jdbc-protocols :as mdb.jdbc-protocols]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.query]
   [metabase.app-db.query-cancelation]
   [metabase.app-db.setup :as mdb.setup]
   [metabase.app-db.spec :as mdb.spec]
   [metabase.config.core :as config]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment metabase.app-db.format/keep-me
         metabase.app-db.query/keep-me
         metabase.app-db.query-cancelation/keep-me)

(p/import-vars
 [mdb.connection
  application-db
  data-source
  db-type
  in-transaction?
  quoting-style
  unique-identifier]

 [mdb.connection-pool-setup
  recent-activity?]

 [mdb.data-source
  broken-out-details->DataSource]

 [mdb.env
  db-file]

 [mdb.jdbc-protocols
  clob->str]

 [mdb.encryption
  decrypt-db
  encrypt-db]

 [metabase.app-db.format
  format-sql]

 [mdb.setup
  migrate!
  quote-for-application-db]

 [mdb.spec
  make-subname
  spec]

 [metabase.app-db.query
  compile
  isa
  join
  qualify
  query
  select-or-insert!
  type-keyword->descendants
  update-or-insert!
  with-conflict-retry]

 [metabase.app-db.query-cancelation
  query-canceled-exception?]

 [liquibase
  changelog-by-id])

;; TODO -- consider whether we can just do this automatically when `getConnection` is called on
;; [[mdb.connection/*application-db*]] (or its data source)
(defn db-is-set-up?
  "True if the Metabase DB is setup and ready."
  []
  (= @(:status mdb.connection/*application-db*) ::setup-finished))

(defn finish-db-setup!
  "Mark the bound Metabase DB as set up and ready."
  []
  (reset! (:status mdb.connection/*application-db*) ::setup-finished))

(defn app-db
  "The Application database. A record, but use accessors [[db-type]], [[data-source]], etc to access. Also
  implements [[javax.sql.DataSource]] directly, so you can call [[.getConnection]] on it directly."
  ^metabase.app_db.connection.ApplicationDB []
  mdb.connection/*application-db*)

(defn setup-db!
  "Do general preparation of database by validating that we can connect. Caller can specify if we should run any pending
  database migrations. If DB is already set up, this function will no-op. Thread-safe.
  Callers must explicitly decide whether or not to create sample content during migrations with the
  `create-sample-content?` keyword argument. This should usually be `true` but is `false` for load-from-h2,
  serialization imports, and in some tests because the sample content makes tests slow enough to cause timeouts."
  [& {:keys [create-sample-content?]}]
  {:pre [(some? create-sample-content?)]}
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
          (mdb.setup/setup-db! db-type data-source auto-migrate? create-sample-content?))
        (finish-db-setup!))))
  :done)

(defn release-migration-locks!
  "Wait up to `timeout-seconds` for the current process to release all migration locks, otherwise force release them."
  [timeout-seconds]
  (if (db-is-set-up?)
    :done
    (mdb.setup/release-migration-locks! (data-source) timeout-seconds)))

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

(defn do-with-application-db
  "Impl for [[with-application-db]] macro."
  [application-db thunk]
  (binding [mdb.connection/*application-db* application-db]
    (thunk)))

(defmacro with-application-db
  "Bind the current application database and execute body."
  {:style/indent [:defn]}
  [application-db & body]
  `(do-with-application-db ~application-db (^:once fn* [] ~@body)))
