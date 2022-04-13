(ns metabase.api.testing
  "Endpoints for testing."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.db.connection :as mdb.connection]
            [metabase.util.files :as files])
  (:import com.mchange.v2.c3p0.PoolBackedDataSource))

;; EVERYTHING BELOW IS FOR H2 ONLY.

(defn- assert-h2 []
  (assert (= (:db-type mdb.connection/*application-db*) :h2)
          "Snapshot/restore only works for :h2 application databases."))

(defn- snapshot-path-for-name
  ^String [snapshot-name]
  (let [path (files/get-path "frontend" "test" "snapshots"
                             (str (str/replace (name snapshot-name) #"\W" "_") ".sql"))]
    (str (.toAbsolutePath path))))

;;;; SAVE

(defn- save-snapshot! [snapshot-name]
  (assert-h2)
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
  []
  (assert-h2)
  (log/info "Sending H2 application database the SHUTDOWN command")
  (with-open [conn (.getConnection mdb.connection/*application-db*)
              stmt (.createStatement conn)]
    (.execute stmt "SHUTDOWN;")))

(defn- kill-app-db-connection-pool!
  "Immediately destroy all open connections in the app DB connection pool."
  []
  (log/info "Destroying application database connection pool")
  (let [{:keys [data-source]} mdb.connection/*application-db*]
    (when (instance? PoolBackedDataSource data-source)
      (.hardReset ^PoolBackedDataSource data-source))))

(defn- restore-app-db-from-snapshot!
  "Drop all objects in the application DB, then reload everything from the SQL dump at `snapshot-path`."
  [^String snapshot-path]
  (assert-h2)
  (log/infof "Restoring snapshot from %s" snapshot-path)
  (api/check-404 (.exists (java.io.File. snapshot-path)))
  (with-open [conn (.getConnection mdb.connection/*application-db*)]
    (doseq [sql-args [["SET LOCK_TIMEOUT 180000"]
                      ["DROP ALL OBJECTS"]
                      ["RUNSCRIPT FROM ?" snapshot-path]]]
      (jdbc/execute! {:connection conn} sql-args))))

(defn- increment-app-db-unique-indentifier!
  "Increment the [[mdb.connection/unique-identifier]] for the Metabase application DB. This effectively flushes all
  caches using it as a key (including things using [[mdb.connection/memoize-for-application-db]]) such as the Settings
  cache."
  []
  (let [new-id (swap! (var-get #'mdb.connection/application-db-counter) inc)]
    (log/infof "Incrementing application DB unique counter %d -> %d (to flush caches)"
               (:id mdb.connection/*application-db*)
               new-id)
    (alter-var-root #'mdb.connection/*application-db* assoc :id new-id)))

(defn- restore-snapshot! [snapshot-name]
  (assert-h2)
  (let [path (snapshot-path-for-name snapshot-name)]
    (shut-down-app-db!)
    (kill-app-db-connection-pool!)
    (restore-app-db-from-snapshot! path)
    (increment-app-db-unique-indentifier!))
  :ok)

(api/defendpoint POST "/restore/:name"
  "Restore a database snapshot for testing purposes."
  [name]
  (restore-snapshot! name)
  nil)

(api/define-routes)
