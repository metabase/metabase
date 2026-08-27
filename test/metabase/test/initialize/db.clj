(ns metabase.test.initialize.db
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.task.bootstrap :as task.bootstrap]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- load-snapshot-if-empty!
  "Seed a not-yet-migrated test app DB from the checked-in snapshot, so the Liquibase run that follows only has to
  apply the changesets after the snapshot boundary. No-op when the DB already has tables (a reused app DB) or when no
  snapshot is checked in for this server's dialect."
  []
  (let [db-type (mdb/db-type)]
    (with-open [conn (.getConnection (mdb/data-source))]
      (when (and (snapshot/loadable? conn db-type)
                 (empty? (snapshot/user-tables conn db-type)))
        (log/info (u/format-color 'blue "Loading %s app DB snapshot %s (migrated through %s)..."
                                  (snapshot/flavor conn db-type) snapshot/snapshot-version
                                  (snapshot/through-changeset-id)))
        (snapshot/load-snapshot! conn db-type)))))

(defn init! []
  (log/info (u/format-color 'blue "Setting up %s test DB and running migrations..." (mdb/db-type)))
  (task.bootstrap/set-jdbc-backend-properties! (mdb/db-type))
  (load-snapshot-if-empty!)
  (mdb/setup-db! :create-sample-content? false) ; skip sample content for speedy tests. this doesn't reflect production
  (log/info (t2/with-connection [^java.sql.Connection conn]
              (let [metadata (.getMetaData conn)]
                (u/format-color 'blue "Application DB is %s %s"
                                (.getDatabaseProductName metadata)
                                (.getDatabaseProductVersion metadata))))))
