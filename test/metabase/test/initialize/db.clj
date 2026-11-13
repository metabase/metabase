(ns metabase.test.initialize.db
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.quartz :as app-db.quartz]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.global-system.mutable-component :as mc]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- load-snapshot-if-empty!
  "Seed a not-yet-migrated test app DB from the checked-in snapshot, so the Liquibase run that follows only applies
  what the snapshot does not record.
  It does nothing when the DB already has tables (a reused app DB), when no snapshot is checked in for this server's
  dialect, or when this JVM does not set up an app DB the way the snapshot was made (see
  [[snapshot/matches-environment?]])."
  []
  (let [db-type (mdb/db-type)]
    (with-open [conn (.getConnection (mdb/data-source))]
      (when (and (snapshot/matches-environment?)
                 (snapshot/loadable? conn db-type)
                 (empty? (snapshot/user-tables conn db-type)))
        (log/info (u/format-color 'blue "Loading %s app DB snapshot %s (migrated through %s)..."
                                  (snapshot/flavor conn db-type) snapshot/snapshot-version
                                  (snapshot/through-changeset-id)))
        (snapshot/load-snapshot! conn db-type)))))

;; The initialized marker is global, so setting up a temporarily bound DB (e.g. inside `with-temp-empty-app-db`) would
;; leave the shared one empty for every later test.
(defn init!
  "Set up the shared test app DB, which is always the root app DB, whatever this thread has bound."
  []
  ;; Read the root once and bind it, so a root replaced on another thread mid-setup cannot split setup across two DBs.
  (mdb/with-application-db (mc/without-binding (mdb.connection/application-db-handle)
                                               mdb.connection/current-application-db)
    (log/info (u/format-color 'blue "Setting up %s test DB and running migrations..." (mdb/db-type)))
    (app-db.quartz/set-jdbc-backend-properties! (mdb/db-type))
    (load-snapshot-if-empty!)
    (mdb/setup-db! :create-sample-content? false) ; skip sample content for speed. this doesn't reflect production
    (log/info (t2/with-connection [^java.sql.Connection conn]
                (let [metadata (.getMetaData conn)]
                  (u/format-color 'blue "Application DB is %s %s"
                                  (.getDatabaseProductName metadata)
                                  (.getDatabaseProductVersion metadata)))))))
