(ns metabase.api.testing
  "Endpoints for testing."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.db.connection :as mdb.connection]
            [metabase.util.files :as files])
  (:import com.mchange.v2.c3p0.PoolBackedDataSource
           metabase.db.connection.ApplicationDB))

;; EVERYTHING BELOW IS FOR H2 ONLY.

(defn- assert-h2 [app-db]
  (assert (= (:db-type app-db) :h2)
          "Snapshot/restore only works for :h2 application databases."))

(defn- snapshot-path-for-name
  ^String [snapshot-name]
  (let [path (files/get-path "frontend" "test" "snapshots"
                             (str (str/replace (name snapshot-name) #"\W" "_") ".sql"))]
    (str (.toAbsolutePath path))))

;;;; SAVE

(defn- save-snapshot! [snapshot-name]
  (assert-h2 mdb.connection/*application-db*)
  (let [path (snapshot-path-for-name snapshot-name)]
    (log/infof "Saving snapshot to %s" path)
    (jdbc/query {:datasource mdb.connection/*application-db*} ["SCRIPT TO ?" path]))
  :ok)

(api/defendpoint POST "/snapshot/:name"
  "Snapshot the database for testing purposes."
  [name]
  (save-snapshot! name)
  nil)

;;;; RESTORE

(defn- shut-down-app-db!
  "Shut down the application DB at the H2 level by executing the `SHUTDOWN` statement."
  [^ApplicationDB app-db]
  (assert-h2 app-db)
  (log/info "Sending H2 application database the SHUTDOWN command")
  (with-open [conn (.getConnection app-db)
              stmt (.createStatement conn)]
    (.execute stmt "SHUTDOWN;")))

(defn- kill-app-db-connection-pool!
  "Immediately destroy all open connections in the app DB connection pool."
  [{:keys [data-source]}]
  (when (instance? PoolBackedDataSource data-source)
    (log/info "Destroying application database connection pool")
    (.hardReset ^PoolBackedDataSource data-source)))

(defn- restore-app-db-from-snapshot!
  "Drop all objects in the application DB, then reload everything from the SQL dump at `snapshot-path`."
  [^ApplicationDB app-db ^String snapshot-path]
  (assert-h2 app-db)
  (log/infof "Restoring snapshot from %s" snapshot-path)
  (api/check-404 (.exists (java.io.File. snapshot-path)))
  (with-open [conn (.getConnection app-db)]
    (doseq [sql-args [["SET LOCK_TIMEOUT 180000"]
                      ["DROP ALL OBJECTS"]
                      ["RUNSCRIPT FROM ?" snapshot-path]]]
      (jdbc/execute! {:connection conn} sql-args))))

(defn- increment-app-db-unique-indentifier
  "Increment the [[mdb.connection/unique-identifier]] for the Metabase application DB. This effectively flushes all
  caches using it as a key (including things using [[mdb.connection/memoize-for-application-db]]) such as the Settings
  cache."
  [app-db]
  (let [new-id (swap! (var-get #'mdb.connection/application-db-counter) inc)]
    (log/infof "Incrementing application DB unique counter %d -> %d (to flush caches)"
               (:id app-db)
               new-id)
    (assoc app-db :id new-id)))

(defn- dummy-app-db
  "Placeholder app DB value of [[mdb.connection/*application-db*]] used during the restore process. Throw an Exception
  if anyone attempts to use it."
  []
  (mdb.connection/application-db
   :h2
   (reify javax.sql.DataSource
     (getConnection [_]
       (throw (UnsupportedOperationException. "You cannot access the application DB during a snapshot restore!"))))))

(defn- restore-snapshot! [snapshot-name]
  (assert-h2 mdb.connection/*application-db*)
  (let [path   (snapshot-path-for-name snapshot-name)
        app-db mdb.connection/*application-db*]
    (try
      (log/info "Temporarily setting *application-db* to no-op dummy app DB")
      ;; set the app DB to `nil` so nobody else can access it.
      (alter-var-root #'mdb.connection/*application-db* (constantly (dummy-app-db)))
      (shut-down-app-db! app-db)
      (kill-app-db-connection-pool! app-db)
      (restore-app-db-from-snapshot! app-db path)
      (finally
        (let [app-db (increment-app-db-unique-indentifier app-db)]
          (log/info "Restoring *application-db*")
          (alter-var-root #'mdb.connection/*application-db* (constantly app-db))))))
  :ok)

(api/defendpoint POST "/restore/:name"
  "Restore a database snapshot for testing purposes."
  [name]
  (restore-snapshot! name)
  nil)

(api/define-routes)
